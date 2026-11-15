"""Reproducible public model conversion; runs in CI, never in the installed app."""
import hashlib,json,pathlib,shutil,subprocess,urllib.request,zipfile
ROOT=pathlib.Path('.cache/paddle-ocr'); ROOT.mkdir(parents=True,exist_ok=True)
OUT=ROOT/'models'; OUT.mkdir(exist_ok=True)
SOURCES=[('det','PP-OCRv5_mobile_det','0d63e78e2b680928f6b1747d76a08db6e645efb7','afa1820cb16c1fd0dad589d0f8b389139061c1ef6d68019685fd07be997dda5b'),('rec','latin_PP-OCRv5_mobile_rec','ab2cd5cc5fa6309be2e5acdfe66eca2c2c127d57','53cdc8b481a7394bb108f96d0fb3432b0a8f392e22c7d18f06dbb2d42b8b25f9')]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def download(url,path,expected=None):
 if not path.exists():
  with urllib.request.urlopen(url,timeout=120) as src,path.open('wb') as dest:shutil.copyfileobj(src,dest)
 if expected and sha(path)!=expected:raise ValueError('Checksum mismatch: '+str(path))
archive=ROOT/'pnnx.zip';download('https://github.com/pnnx/pnnx/releases/download/20261020/pnnx-20261020-linux.zip',archive,'6cfff631178e02e62542e72bf14e0045dfce62095bbc1f633176e9c0778ab8a6')
with zipfile.ZipFile(archive) as z:z.extractall(ROOT/'converter')
pnnx=next(p for p in (ROOT/'converter').rglob('pnnx') if p.is_file());pnnx.chmod(0o755);pnnx=pnnx.resolve()
provenance=[]
for short,name,revision,digest in SOURCES:
 model=ROOT/name;model.mkdir(exist_ok=True)
 for filename in ['inference.json','inference.pdiparams','inference.yml','config.json']:
  download('https://huggingface.co/PaddlePaddle/'+name+'/resolve/'+revision+'/'+filename,model/filename,digest if filename.endswith('pdiparams') else None)
 onnx=OUT/(short+'.onnx')
 subprocess.run(['paddle2onnx','--model_dir',str(model),'--model_filename','inference.json','--params_filename','inference.pdiparams','--save_file',str(onnx),'--opset_version','17','--enable_onnx_checker','True'],check=True)
 shapes=['inputshape=[1,3,320,320]','inputshape2=[1,3,256,256]'] if short=='det' else ['inputshape=[1,3,48,160]','inputshape2=[1,3,48,256]']
 subprocess.run([str(pnnx),onnx.name,*shapes,'fp16=0'],cwd=OUT,check=True)
 provenance.append({'role':short,'repository':'PaddlePaddle/'+name,'revision':revision,'inputs':{p.name:sha(p) for p in model.iterdir() if p.is_file()}})
 if short=='rec':
  dictionary=json.loads((model/'config.json').read_text())['PostProcess']['character_dict']
  assert len(dictionary)==836 and ' ' not in dictionary
  (OUT/'dictionary.json').write_text(json.dumps(['']+dictionary+[' '],ensure_ascii=False),encoding='utf-8')
manifest={'version':1,'model':'ppocr-v5-latin-f32-v1','description':'PP-OCRv5 mobile detector and Latin recognizer; text OCR, not PP-StructureV3','sources':provenance,'conversion':{'paddlepaddle':'3.0.0','paddle2onnx':'2.1.0','opset':17,'pnnx':'20261020','fp16':False},'files':{p.name:{'sha256':sha(p),'bytes':p.stat().st_size} for p in OUT.iterdir() if p.suffix in ['.bin','.param','.json']},'license':'Apache-2.0'}
(OUT/'model-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(manifest,indent=2))
