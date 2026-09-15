"""Promote the exact Windows payload after all required jobs in this run passed."""
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import zipfile

repo = os.environ['REPOSITORY']
sha = os.environ['GITHUB_SHA']
assert repo == 'vellxw/Perfect-harness' and re.fullmatch(r'[0-9a-f]{40}', sha)
assert os.environ['GITHUB_REF'] == 'refs/heads/main'
version = json.loads(pathlib.Path('package.json').read_text())['version']
assert re.fullmatch(r'\d+\.\d+\.\d+', version)
tag = 'v' + version
root = pathlib.Path('downloaded')
out = pathlib.Path('release-upload')
out.mkdir(exist_ok=False)

def one(base, name):
    paths = list(base.rglob(name))
    assert len(paths) == 1 and paths[0].is_file() and not paths[0].is_symlink(), (name, paths)
    return paths[0]

def digest(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

installer = root / 'Perfect-V4-Windows-Espanol-Instalador'
portable = root / 'Perfect-V4-Windows-Espanol-Portable'
manifest = json.loads(one(installer, 'build-manifest.json').read_text(encoding='utf-8-sig'))
report = json.loads(one(installer, 'report.json').read_text(encoding='utf-8-sig'))
assert manifest['sourceCommit'] == sha and manifest['version'] == version
assert not manifest.get('dirty', False), 'Build used an uncommitted source tree'
assert report['status'] == 'PASS' and report['sourceCommit'] == sha
assert report['personalProviders'] is False
sums = one(installer, 'SHA256SUMS.txt').read_text(encoding='utf-8-sig')
assert sums == one(portable, 'SHA256SUMS.txt').read_text(encoding='utf-8-sig')
expected = {}
for line in sums.splitlines():
    m = re.fullmatch(r'([a-f0-9]{64})  ([A-Za-z0-9._-]+)', line)
    assert m, 'Unexpected checksum entry'
    assert m[2] not in expected
    expected[m[2]] = m[1]
assert set(expected) == {'Perfect-Harness-Setup-x64.exe', 'Perfect-Harness-Windows-x64.zip'}
for name, source in [('Perfect-Harness-Setup-x64.exe', installer), ('Perfect-Harness-Windows-x64.zip', portable)]:
    p = one(source, name)
    assert digest(p) == expected[name], 'Binary differs from tested checksum'
    shutil.copyfile(p, out / name)
assert report['installerSha256'] == expected['Perfect-Harness-Setup-x64.exe']
shutil.copyfile(one(installer, 'build-manifest.json'), out / 'build-manifest.json')
shutil.copyfile(one(installer, 'report.json'), out / 'windows-installation-report.json')
with zipfile.ZipFile(out / 'Perfect-V4-Evidence.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for folder in ['Perfect-V4-UI-Evidence', 'Perfect-V4-Blender-Evidence', 'Perfect-V4-Windows-Capturas-y-Pruebas', 'v4-e2e-evidence']:
        base = root / folder
        assert base.is_dir() and any(base.rglob('*')), 'Required evidence is absent: ' + folder
        for p in sorted(base.rglob('*')):
            if p.is_file():
                assert not p.is_symlink()
                z.write(p, p.relative_to(root))
checksums = '\n'.join(digest(p) + '  ' + p.name for p in sorted(out.iterdir())) + '\n'
(out / 'SHA256SUMS.txt').write_text(checksums)
notes = f'''# Perfect Harness {version}

Distribución Windows x64 en español, desde main `{sha}`.

Instalador y portable contienen exactamente los binarios probados en esta ejecución: https://github.com/{repo}/actions/runs/{os.environ['GITHUB_RUN_ID']}.

Incluye selección manual de skills por versión/hash, equipos y perfiles, creador con cuarentena, comparaciones A/B y validación local. Blender crea una fuente editable, la reabre independientemente y verifica GLB/render en aislamiento.

## Verificación y límites
Las puertas Linux, Windows, Docker E2E, Blender, TUI e instalación/actualización deben aprobarse antes de publicar. Los tests de IA emplean Pi real con proveedor sintético; no se usaron cuentas personales ni OAuth. Capturas TUI con datos DEMO y capturas reales de Windows Terminal están identificadas en la evidencia. La captura automática no equivale por sí sola a una revisión estética humana.

Windows probado en el runner Windows Server 2025, no en la PC personal Windows 11. Ejecutables de Perfect sin firma Authenticode; SHA256 comprueba integridad, no identidad del editor. No desactives SmartScreen ni Defender. Las cuentas, Docker Desktop/WSL y editores personales se validan localmente.

## Instalación
Usar `Perfect-Harness-Setup-x64.exe`, o extraer completa la carpeta portable y ejecutar `Perfect.exe`. No copiar solo el launcher. No se actualiza automáticamente ninguna instalación existente. Dentro de Perfect: `/habilidades`, `/equipos`, `/perfiles`. Ayuda clásica: `Perfect.exe --sin-interfaz --ayuda`.
'''
pathlib.Path('release-notes.md').write_text(notes)
existing = subprocess.run(['gh', 'release', 'view', tag, '--repo', repo, '--json', 'isDraft,targetCommitish'], text=True, capture_output=True)
if existing.returncode == 0:
    raise SystemExit('Release already exists; refusing to replace or relabel its assets: ' + tag)
if 'release not found' not in existing.stderr.lower() and '404' not in existing.stderr:
    raise RuntimeError('Could not establish release absence: ' + existing.stderr)
subprocess.run(['gh', 'release', 'create', tag, '--repo', repo, '--target', sha, '--draft', '--title', 'Perfect Harness ' + version, '--notes-file', 'release-notes.md'], check=True)
subprocess.run(['gh', 'release', 'upload', tag, '--repo', repo] + [str(p) for p in sorted(out.iterdir())], check=True)
subprocess.run(['gh', 'release', 'edit', tag, '--repo', repo, '--draft=false', '--latest'], check=True)
verify = pathlib.Path('published-verification')
subprocess.run(['gh', 'release', 'download', tag, '--repo', repo, '--dir', str(verify)], check=True)
for p in out.iterdir():
    assert digest(verify / p.name) == digest(p), 'Published bytes do not match: ' + p.name
print(json.dumps({'status': 'PUBLISHED_AND_HASH_VERIFIED', 'version': version, 'sourceCommit': sha, 'url': f'https://github.com/{repo}/releases/tag/{tag}', 'assets': sorted(p.name for p in out.iterdir())}, indent=2))
