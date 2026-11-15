import hashlib,json,os,pathlib,shutil,subprocess,urllib.request,zipfile
import package_support
ROOT=pathlib.Path('.cache/paddle-ocr').resolve();SDK=ROOT/'android-sdk';SDK.mkdir(parents=True,exist_ok=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def download(url,path,digest):
 if not path.exists():
  with urllib.request.urlopen(url,timeout=120) as src,path.open('wb') as dst:shutil.copyfileobj(src,dst)
 if sha(path)!=digest:raise ValueError('Checksum mismatch: '+str(path))
 return path
packages=[('ncnn','https://github.com/Tencent/ncnn/releases/download/20261020/ncnn-20261020-android-vulkan.zip','6e0c5f9b397faf32b923de2ef6210af9bf375851869dceff06a8005331981086'),('opencv','https://github.com/nihui/opencv-mobile/releases/download/v38/opencv-mobile-4.14.0-android.zip','2169b7cf49dcd8c314ea99efaa8106ce5de282ab01835cf34df08ed133cbbc9f')]
for name,url,digest in packages:
 archive=download(url,SDK/(name+'.zip'),digest)
 with zipfile.ZipFile(archive) as z:z.extractall(SDK/name)
include=SDK/'include';include.mkdir(exist_ok=True)
download('https://github.com/nlohmann/json/releases/download/v3.12.0/json.hpp',include/'json.hpp','aaf127c04cb31c406e5b04a63f1ae89369fccde6d8fa7cdda1ed4f32dfc5de63')
sdkroot=pathlib.Path(os.environ.get('ANDROID_HOME',os.environ.get('ANDROID_SDK_ROOT','/usr/local/lib/android/sdk')))
ndkpath=os.environ.get('ANDROID_NDK_LATEST_HOME') or os.environ.get('ANDROID_NDK_HOME')
ndk=pathlib.Path(ndkpath) if ndkpath else sorted((sdkroot/'ndk').iterdir(),key=lambda p:tuple(map(int,p.name.split('.'))))[-1]
print('Native Android toolchain:',ndk,(ndk/'source.properties').read_text(),flush=True)
output=ROOT/'android-libs';output.mkdir(exist_ok=True)
opencv=next((SDK/'opencv').rglob('OpenCVConfig.cmake')).parent
for abi in ['arm64-v8a','armeabi-v7a','x86_64']:
 ncnn=next(p for p in (SDK/'ncnn').rglob('ncnnConfig.cmake') if abi in str(p)).parent
 build=ROOT/('build-android-'+abi)
 subprocess.run(['cmake','-S','native/paddle-ocr','-B',str(build),'-G','Ninja','-DCMAKE_BUILD_TYPE=Release','-DCMAKE_TOOLCHAIN_FILE='+str(ndk/'build/cmake/android.toolchain.cmake'),'-DANDROID_ABI='+abi,'-DANDROID_PLATFORM=android-26','-DANDROID_STL=c++_static','-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON','-Dncnn_DIR='+str(ncnn),'-DOpenCV_DIR='+str(opencv),'-DJSON_INCLUDE_DIR='+str(include)],check=True)
 subprocess.run(['cmake','--build',str(build),'--parallel','4'],check=True)
 target=output/abi;target.mkdir(exist_ok=True);shutil.copy2(build/'libpaddle_ocr.so',target/'libpaddle_ocr.so')
package_support.licenses(output)
models=ROOT/'model-package';models.mkdir(exist_ok=True)
package_support.models(ROOT/'models',models)
package_support.manifest(models)
manifest={'version':1,'source':os.environ.get('GITHUB_SHA')}
for key,name,path in [('android','paddle-ocr-android-v1',output),('models','paddle-ocr-models-v1',models)]:
 archive=pathlib.Path(shutil.make_archive(str(ROOT/name),'zip',path));manifest[key]={'name':archive.name,'bytes':archive.stat().st_size,'sha256':sha(archive),'url':'https://github.com/n3me5is-git/chatbox-venice/releases/download/paddle-ocr-runtime-v1/'+archive.name}
 if key=='models':manifest[key]['manifestSha256']=sha(models/'runtime-manifest.json')
(ROOT/'android-download-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(manifest,indent=2))
