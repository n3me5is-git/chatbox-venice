import hashlib,json,os,pathlib,shutil,subprocess,urllib.request,zipfile
ROOT=pathlib.Path('.cache/paddle-ocr').resolve();SDK=ROOT/'sdk';SDK.mkdir(parents=True,exist_ok=True)
def download(url,path,digest):
 if not path.exists():
  with urllib.request.urlopen(url,timeout=120) as src,path.open('wb') as dst:shutil.copyfileobj(src,dst)
 if hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise ValueError('Checksum mismatch: '+str(path))
 return path
packages=[('ncnn','https://github.com/Tencent/ncnn/releases/download/20261020/ncnn-20261020-windows-vs2022.zip','ef9fe4463e5db0f41484ad25e91686e709b91e400858639aed631c280dfa91d4'),('opencv','https://github.com/nihui/opencv-mobile/releases/download/v38/opencv-mobile-4.14.0-windows-vs2022.zip','607c71d64f7b65a4a14465e02429f7fecbf57a331c053c4d46184e0852e12c6c')]
for name,url,digest in packages:
 archive=download(url,SDK/(name+'.zip'),digest)
 with zipfile.ZipFile(archive) as z:z.extractall(SDK/name)
include=SDK/'include';include.mkdir(exist_ok=True)
download('https://github.com/nlohmann/json/releases/download/v3.12.0/json.hpp',include/'json.hpp','aaf127c04cb31c406e5b04a63f1ae89369fccde6d8fa7cdda1ed4f32dfc5de63')
def config(name,filename):
 candidates=[p for p in (SDK/name).rglob(filename) if 'x64' in str(p).lower() and 'arm' not in str(p).lower()]
 if not candidates:raise ValueError('SDK config not found: '+filename)
 candidates.sort(key=lambda p:('static' not in str(p).lower(),len(str(p))))
 print('SDK configuration',name,str(candidates[0]));return str(candidates[0].parent)
build=ROOT/'build-windows'
subprocess.run(['cmake','-S','native/paddle-ocr','-B',str(build),'-A','x64','-Dncnn_DIR='+config('ncnn','ncnnConfig.cmake'),'-DOpenCV_DIR='+config('opencv','OpenCVConfig.cmake'),'-DJSON_INCLUDE_DIR='+str(include),'-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreadedDLL'],check=True)
subprocess.run(['cmake','--build',str(build),'--config','Release','--parallel','4'],check=True)
package=ROOT/'package';package.mkdir(exist_ok=True)
shutil.copy2(build/'Release/paddle-ocr-worker.exe',package/'paddle-ocr-worker.exe')
vswhere=pathlib.Path(os.environ['ProgramFiles(x86)'])/'Microsoft Visual Studio/Installer/vswhere.exe'
vs=pathlib.Path(subprocess.check_output([str(vswhere),'-latest','-property','installationPath'],text=True).strip())
candidates=[p for p in (vs/'VC/Redist/MSVC').rglob('Microsoft.VC143.CRT') if p.parent.name=='x64' and 'onecore' not in str(p).lower()]
if not candidates:raise ValueError('x64 Visual C++ runtime not found')
redist=sorted(candidates,key=lambda p:len(str(p)))[0].parent
for folder in redist.iterdir():
 if folder.name.endswith(('.CRT','.OpenMP')):
  for dll in folder.glob('*.dll'):shutil.copy2(dll,package/dll.name)
for p in (ROOT/'models').iterdir():
 if p.name.endswith(('.ncnn.param','.ncnn.bin')) or p.name in ['dictionary.json','model-manifest.json']:shutil.copy2(p,package/p.name)
shutil.copy2('native/paddle-ocr/THIRD-PARTY-NOTICES.md',package/'THIRD-PARTY-NOTICES.md')
licenses=package/'licenses';licenses.mkdir(exist_ok=True)
for name,path in [('ncnn',SDK/'ncnn'),('opencv',SDK/'opencv'),('clipper',build/'_deps/clipper-src')]:
 for p in path.rglob('*'):
  if p.is_file() and p.name.lower() in ['license','license.txt','licence','licence.txt']:
   shutil.copy2(p,licenses/(name+'-'+p.name));break
(package/'runtime-manifest.json').write_text(json.dumps({'version':1,'model':'ppocr-v5-latin-f32-v1','files':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in package.iterdir() if p.is_file()}},indent=2),encoding='utf-8')
archive=pathlib.Path(shutil.make_archive(str(ROOT/'paddle-ocr-win-x64-v1'),'zip',package))
(ROOT/'download-manifest.json').write_text(json.dumps({'name':archive.name,'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()},indent=2),encoding='utf-8')
print((ROOT/'download-manifest.json').read_text())
