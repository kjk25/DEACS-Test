"""Read-only serial tunnel diagnostic. Close the browser serial connection first."""
import argparse
import binascii
import struct
import time
import serial


def packet(kind, channel=0, payload=b''):
    body = struct.pack('<BBH', kind, channel, len(payload)) + payload
    return b'DUSB' + body + struct.pack('<H', binascii.crc_hqx(body, 0xffff))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', required=True)
    parser.add_argument('--seconds', type=float, default=8)
    parser.add_argument('--ping-only', action='store_true')
    parser.add_argument('--open-only', action='store_true')
    parser.add_argument('--path', default='/api/status')
    args = parser.parse_args()
    port = serial.Serial(baudrate=921600, timeout=.05)
    port.dtr = False
    port.rts = False
    port.port = args.port
    try:
        port.open()
    except serial.SerialException as error:
        raise SystemExit(f'Port unavailable (browser may still own it): {error}')
    with port:
        port.write(packet(1, payload=b'\x01'))
        buffer = b''
        start = time.monotonic()
        ping = start
        response = b''
        opened = False
        pongs = 0
        while time.monotonic() - start < args.seconds:
            now = time.monotonic()
            if now - ping >= 1:
                port.write(packet(8))
                ping = now
            buffer += port.read(4096)
            while len(buffer) >= 10:
                index = buffer.find(b'DUSB')
                if index < 0:
                    if buffer[:-3].strip(b'\x00\r\n '):
                        print('Non-protocol output:', repr(buffer[:-3]))
                    buffer = buffer[-3:]
                    break
                buffer = buffer[index:]
                if len(buffer) < 10:
                    break
                kind, channel, size = struct.unpack_from('<BBH', buffer, 4)
                if size > 512:
                    buffer = buffer[1:]
                    continue
                if len(buffer) < size + 10:
                    break
                raw, buffer = buffer[:size+10], buffer[size+10:]
                if binascii.crc_hqx(raw[4:-2], 0xffff) != struct.unpack_from('<H', raw, len(raw)-2)[0]:
                    print('CRC failure')
                    continue
                payload = raw[8:-2]
                print(f'{now-start:.2f}s kind={kind} channel={channel} size={size}')
                if kind == 9:
                    pongs += 1
                if kind == 2:
                    print('Firmware:', payload.decode(errors='replace'))
                    port.write(packet(8))
                elif kind == 9 and not opened and not args.ping_only:
                    opened = True
                    port.write(packet(3, 1, struct.pack('<H', 80)))
                elif kind == 4:
                    if not args.open_only:
                        port.write(packet(5, 1, f'GET {args.path} HTTP/1.1\r\nHost: deacs\r\nConnection: close\r\n\r\n'.encode()))
                elif kind == 5:
                    response += payload
                    port.write(packet(6, channel))
                elif kind == 7 and channel == 1:
                    print(response.decode(errors='replace'))
                    if not args.open_only and not response.startswith(b'HTTP/'):
                        raise SystemExit('Channel closed before receiving an HTTP response')
                    return
        if args.ping_only and pongs >= 2:
            print('Heartbeat OK')
            return
        print('Timed out. Received HTTP bytes:', len(response))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
