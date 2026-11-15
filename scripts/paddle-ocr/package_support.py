"""Shared packaging provenance and complete, checked-in license texts."""
import hashlib,json,os,pathlib,shutil
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def licenses(output):
 for path in pathlib.Path('native/paddle-ocr/licenses').glob('LICENSE-*.txt'):shutil.copy2(path,output/path.name)
 shutil.copy2('native/paddle-ocr/THIRD-PARTY-NOTICES.md',output/'THIRD-PARTY-NOTICES.md')
def models(source,output):
 names=['det.ncnn.param','det.ncnn.bin','rec.ncnn.param','rec.ncnn.bin','dictionary.json']
 for name in names:shutil.copy2(source/name,output/name)
 manifest=json.loads((source/'model-manifest.json').read_text(encoding='utf-8'))
 manifest['files']={name:{'bytes':(output/name).stat().st_size,'sha256':digest(output/name)} for name in names}
 (output/'model-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8');licenses(output)
def manifest(output):
 value={'version':1,'model':'ppocr-v5-latin-f32-v1','sourceCommit':os.environ.get('GITHUB_SHA'),'readingOrder':'geometric-xycut-prose-v2','nativeSources':{str(p):digest(p) for p in pathlib.Path('native/paddle-ocr').glob('*') if p.suffix in ['.cpp','.h']},'files':{p.name:{'bytes':p.stat().st_size,'sha256':digest(p)} for p in output.iterdir() if p.is_file() and p.name!='runtime-manifest.json'}}
 (output/'runtime-manifest.json').write_text(json.dumps(value,indent=2),encoding='utf-8')
