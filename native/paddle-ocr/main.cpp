#include "core.h"
#include <gpu.h>
#include <opencv2/highgui/highgui.hpp>
#include <iostream>
#include <memory>
#include <stdexcept>

static std::vector<unsigned char> decode(const std::string& data){
 if(data.empty()||data.size()>24*1024*1024||data.size()%4)throw std::runtime_error("Invalid OCR image");
 const std::string alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";std::vector<unsigned char> out;out.reserve(data.size()/4*3);unsigned int accumulator=0;int bits=0;bool padding=false;
 for(unsigned char c:data){if(c=='='){padding=true;continue;}auto n=alphabet.find(c);if(padding||n==std::string::npos)throw std::runtime_error("Invalid OCR image");accumulator=(accumulator<<6)|unsigned(n);bits+=6;if(bits>=8){bits-=8;out.push_back(static_cast<unsigned char>((accumulator>>bits)&255));}}
 return out;
}
int main(int argc,char**argv){
 using local_ocr::Json;
 try{
  if(argc==2&&std::string(argv[1])=="--devices"){
   Json devices=Json::array();
#if NCNN_VULKAN
   ncnn::create_gpu_instance();for(int i=0;i<ncnn::get_gpu_count();i++)devices.push_back({{"index",i},{"name",ncnn::get_gpu_info(i).device_name()}});
#endif
   std::cout<<Json({{"devices",devices}}).dump()<<std::endl;return 0;
  }
  std::string root=".",backend="cpu";int threads=4;
  for(int i=1;i<argc;i+=2){if(i+1>=argc)throw std::runtime_error("Invalid OCR arguments");std::string arg=argv[i];if(arg=="--models")root=argv[i+1];else if(arg=="--backend")backend=argv[i+1];else if(arg=="--threads")threads=std::stoi(argv[i+1]);else throw std::runtime_error("Invalid OCR argument");}
  if(backend!="cpu"&&backend!="vulkan")throw std::runtime_error("Invalid OCR backend");
  local_ocr::Engine engine(root,backend=="vulkan",threads);std::cout<<engine.info().dump()<<std::endl;
  std::string line;
  while(std::getline(std::cin,line)){
   if(line.size()>25*1024*1024)throw std::runtime_error("OCR request exceeds the size limit");std::string id;
   try{auto request=Json::parse(line);id=request.at("id").get<std::string>();if(id.empty()||id.size()>160)throw std::runtime_error("Invalid OCR request identity");auto bytes=decode(request.at("image").get<std::string>());auto image=cv::imdecode(bytes,cv::IMREAD_COLOR);std::fill(bytes.begin(),bytes.end(),0);auto result=engine.run(image);result["id"]=id;std::cout<<result.dump()<<std::endl;}
   catch(const std::exception& error){std::cout<<Json({{"id",id},{"error","Local PaddleOCR could not recognize this image"},{"diagnostic",error.what()}}).dump()<<std::endl;}
   std::fill(line.begin(),line.end(),'\0');line.clear();
  }return 0;
 }catch(const std::exception& error){std::cerr<<"PaddleOCR startup failed: "<<error.what()<<std::endl;return 1;}
}
