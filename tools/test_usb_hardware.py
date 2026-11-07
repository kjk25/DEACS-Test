"""Explicit hardware regression: replaces volatile simulator entries, CAN TX off.

Run only with permission to stop/clear/test the device simulator. Requires pyserial.
The browser must release the serial port first. No firmware or filesystem writes.
"""
import argparse
import binascii
import json
import struct
import time
from urllib.parse import urlencode
import serial
from check_usb_device import packet


class Peer:
    def __init__(self, port):
        self.port = serial.Serial(baudrate=921600, timeout=.02)
        self.port.dtr = self.port.rts = False
        self.port.port = port
        self.port.open()
        self.buffer = b''
        self.payloads = {}
        self.events = []
        self.next_id = 2
        self.port.write(packet(1, payload=b'\x01'))
        self.wait(2, 0)

    def read(self):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            self.buffer += self.port.read(4096)
            while len(self.buffer) >= 10:
                index = self.buffer.find(b'DUSB')
                if index < 0:
                    if b'panic' in self.buffer or b'Guru Meditation' in self.buffer:
                        raise AssertionError('Device panic: ' + repr(self.buffer))
                    self.buffer = self.buffer[-3:]
                    break
                self.buffer = self.buffer[index:]
                if len(self.buffer) < 10:
                    break
                kind, channel, size = struct.unpack_from('<BBH', self.buffer, 4)
                assert size <= 512, 'Invalid packet length'
                if len(self.buffer) < size + 10:
                    break
                raw, self.buffer = self.buffer[:size+10], self.buffer[size+10:]
                assert binascii.crc_hqx(raw[4:-2], 0xffff) == struct.unpack_from('<H', raw, len(raw)-2)[0], 'CRC error'
                if kind == 5:
                    self.payloads[channel] = self.payloads.get(channel, b'') + raw[8:-2]
                    self.port.write(packet(6, channel))
                return kind, channel
        raise AssertionError('USB response timed out')

    def wait(self, kind, channel):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if self.read() == (kind, channel):
                return
        raise AssertionError(f'Expected packet {kind}/{channel}')

    def open(self, channel, port):
        self.payloads[channel] = b''
        self.port.write(packet(3, channel, struct.pack('<H', port)))
        self.wait(4, channel)

    def write(self, channel, data):
        for offset in range(0, len(data), 512):
            self.port.write(packet(5, channel, data[offset:offset+512]))
            self.wait(6, channel)

    def api(self, path, data=None):
        channel = self.next_id
        self.next_id = ((channel + 4) % 256) or 2
        self.open(channel, 80)
        body = urlencode(data).encode() if data is not None else b''
        method = 'POST' if data is not None else 'GET'
        header = f'{method} {path} HTTP/1.1\r\nHost: deacs\r\nConnection: close\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: {len(body)}\r\n\r\n'.encode()
        self.write(channel, header + body)
        self.wait(7, channel)
        raw = self.payloads.pop(channel)
        head, response = raw.split(b'\r\n\r\n', 1)
        assert b' 200 ' in head.split(b'\r\n', 1)[0], repr(raw)
        return json.loads(response)

    def websocket(self):
        self.open(1, 81)
        self.write(1, b'GET / HTTP/1.1\r\nHost: deacs\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n')
        while b'\r\n\r\n' not in self.payloads[1]:
            self.read()
        head, self.payloads[1] = self.payloads[1].split(b'\r\n\r\n', 1)
        assert b' 101 ' in head, head

    def ws_messages(self):
        data = self.payloads[1]
        while len(data) >= 2:
            size, offset = data[1] & 127, 2
            if size == 126:
                if len(data) < 4:
                    break
                size, offset = struct.unpack_from('>H', data, 2)[0], 4
            elif size == 127:
                if len(data) < 10:
                    break
                size, offset = struct.unpack_from('>Q', data, 2)[0], 10
            if len(data) < offset + size:
                break
            if data[0] & 15 == 1:
                self.events.append(json.loads(data[offset:offset+size]))
            data = data[offset+size:]
        self.payloads[1] = data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', required=True)
    args = parser.parse_args()
    peer = Peer(args.port)
    try:
        status = peer.api('/api/status')
        print('Status OK:', status['fw'])
        for loop in (0, 1):
            peer.events.clear()
            peer.api('/api/sim/stop', {})
            peer.api('/api/sim/clear', {})
            for i in range(14):
                peer.api('/api/sim/add', dict(id=f'{0x100+i:X}', data='10203040', interval=100, enabled=1, extended=0))
            peer.websocket()
            started = peer.api('/api/sim/start', dict(loop=loop, liveTx=0))
            assert started['simulator'] and started['simLoop'] == bool(loop), started
            tx_before = started['tx']
            deadline = time.monotonic() + .5
            while time.monotonic() < deadline:
                peer.read()
                peer.ws_messages()
                received = [f for e in peer.events for f in
                            (e.get('items', []) if e.get('type') == 'frames' else [e] if e.get('type') == 'frame' else [])
                            if f.get('sim')]
                if len({f['id'] for f in received}) == 14:
                    break
            status = peer.api('/api/status')
            assert status['simulator'] == bool(loop), status
            assert status['tx'] == tx_before, 'Unexpected CAN TX'
            peer.ws_messages()
            frames = [f for e in peer.events for f in
                      (e.get('items', []) if e.get('type') == 'frames' else [e] if e.get('type') == 'frame' else [])
                      if f.get('sim')]
            expected = {f'{0x100+i:X}' for i in range(14)}
            assert {f['id'].upper() for f in frames} == expected, frames
            assert all(f['dlc'] == 4 and f['data'].upper() == '10203040' for f in frames), frames
            peer.api('/api/sim/stop', {})
            print(f'14 entries, loop={loop}, live frames and unchanged CAN TX: OK')
        peer.api('/api/sim/clear', {})
        print('Hardware regression PASS')
    finally:
        peer.port.close()


if __name__ == '__main__':
    main()
