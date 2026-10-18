#!/usr/bin/env python3
"""Локальная проверка с мок-сервером, отдельными логами и гарантированной остановкой своих процессов."""
import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--no-e2e', action='store_true', help='только ядра, сборки и HTTP-контракт')
    parser.add_argument('--ios-ui', action='store_true', help='также iOS UI на выделенном симуляторе')
    parser.add_argument('--android-ui', action='store_true', help='также instrumentation на уже запущенном выделенном эмуляторе')
    args = parser.parse_args()
    simulator = 'F72A18B7-AE37-453C-85B8-7F94CD3F4C8E'
    simulator_was_booted = True
    if args.ios_ui:
        listed = subprocess.run(['xcrun', 'simctl', 'list', 'devices', 'booted', '-j'], capture_output=True, text=True)
        if listed.returncode == 0:
            simulator_was_booted = any(device.get('udid') == simulator for devices in json.loads(listed.stdout).get('devices', {}).values() for device in devices)
    output = ROOT / 'build' / 'verification' / datetime.now().strftime('%Y%m%d-%H%M%S')
    output.mkdir(parents=True, exist_ok=True)
    processes = []
    handles = []
    results = []
    env = dict(os.environ, PATH=str(Path.home() / '.cargo/bin') + os.pathsep + os.environ.get('PATH', ''), NOCTURNE_MOCK='http://127.0.0.1:4533', NOCTURNE_MOCK_PASSWORD='demo', S=str(output))

    def available(port):
        with socket.socket() as sock:
            if sock.connect_ex(('127.0.0.1', port)) == 0:
                raise RuntimeError(f'Порт {port} занят. Проверка не использует и не останавливает чужой сервер.')

    def stop(process):
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)

    def start(name, command, cwd=ROOT):
        log = (output / f'{name}.log').open('w')
        handles.append(log)
        process = subprocess.Popen(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        processes.append(process)
        return process

    def ready(url, process):
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            if process.poll() is not None: raise RuntimeError(f'Сервер завершился раньше готовности: {url}')
            try:
                with urlopen(url, timeout=2) as response:
                    if response.status == 200: return
            except OSError: pass
            time.sleep(0.25)
        raise RuntimeError(f'Не дождались готовности: {url}')

    def run(name, command, cwd=ROOT, timeout=1200):
        before = time.monotonic()
        process = start(name, command, cwd)
        try: code = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            stop(process)
            code = 124
        result = dict(name=name, command=command, cwd=str(cwd.relative_to(ROOT)), exitCode=code, seconds=round(time.monotonic() - before, 2), log=f'{name}.log')
        results.append(result)
        print(f'{"PASS" if code == 0 else "FAIL"} {name}: exit={code}, {result["seconds"]}s', flush=True)
        if code:
            print('\n'.join((output / f'{name}.log').read_text(errors='replace').splitlines()[-30:]), flush=True)
            raise RuntimeError(f'Проверка {name} не прошла')

    try:
        available(4533)
        mock = start('mock', ['python3', 'shared/mock-server/mock_navidrome.py', '180'])
        ready('http://127.0.0.1:4533/radio', mock)
        run('swift', ['swift', 'test'])
        run('desktop-build', ['bun', 'run', 'build'], ROOT / 'desktop')
        run('desktop', ['bun', 'run', 'test'], ROOT / 'desktop')
        run('rust', ['cargo', 'test'], ROOT / 'desktop/src-tauri')
        run('android', ['./gradlew', ':core:test', ':app:assembleDebug'], ROOT / 'android')
        run('site', ['bun', 'run', 'build'], ROOT / 'site')
        if not args.no_e2e:
            available(1431)
            vite = start('vite', ['bunx', 'vite', '--port', '1431', '--strictPort'], ROOT / 'desktop')
            ready('http://localhost:1431/src/main.tsx', vite)
            for name in ['lifecycle', 'smoke', 'library', 'sync', 'smart', 'transitions', 'triz']:
                if name == 'transitions':
                    stop(mock)
                    mock = start('mock-short', ['python3', 'shared/mock-server/mock_navidrome.py', '8'])
                    ready('http://127.0.0.1:4533/radio', mock)
                run(f'e2e-{name}', ['node', f'e2e/{name}.mjs'], ROOT / 'desktop', timeout=180)
        if args.ios_ui or args.android_ui:
            stop(mock)
            mock = start('mock-ui', ['python3', 'shared/mock-server/mock_navidrome.py', '8'])
            ready('http://127.0.0.1:4533/radio', mock)
        if args.ios_ui:
            run('ios-ui', ['xcodebuild', 'test', '-project', 'Nocturne.xcodeproj', '-scheme', 'Nocturne', '-destination', 'id=F72A18B7-AE37-453C-85B8-7F94CD3F4C8E', '-derivedDataPath', 'build', '-parallel-testing-enabled', 'NO', 'CODE_SIGNING_ALLOWED=NO', '-only-testing:NocturneUITests'])
        if args.ios_ui and not simulator_was_booted:
            subprocess.run(['xcrun', 'simctl', 'shutdown', simulator], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if args.android_ui:
            run('android-ui', ['./gradlew', ':app:connectedDebugAndroidTest'], ROOT / 'android')
    finally:
        if args.ios_ui and not simulator_was_booted:
            subprocess.run(['xcrun', 'simctl', 'shutdown', simulator], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for process in reversed(processes): stop(process)
        for handle in handles: handle.close()
        (output / 'summary.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
        print(f'Отчёт: {output}', flush=True)
    return 0


if __name__ == '__main__':
    try: sys.exit(main())
    except (RuntimeError, KeyboardInterrupt) as error:
        print(str(error) or 'Проверка прервана', file=sys.stderr)
        sys.exit(1)
