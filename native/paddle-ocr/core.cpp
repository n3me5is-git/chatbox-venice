// Detection/recognition preprocessing follows PaddleOCR (Apache-2.0) and
// Tencent's ncnn PPOCRv5 example (BSD-3-Clause). DB polygon expansion uses
// Clipper2 instead of the demo's approximate rectangle enlargement.
#include "core.h"
#include <gpu.h>
#include <opencv2/imgproc/imgproc.hpp>
#include <clipper2/clipper.h>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <fstream>
#include <numeric>
#include <stdexcept>

namespace local_ocr {
static void check(int result){if(result)throw std::runtime_error("PaddleOCR inference failed");}
Engine::Engine(const std::string& root,bool gpu,int threads){
 if(threads<1||threads>32)throw std::runtime_error("Invalid OCR thread count");
#if NCNN_VULKAN
 if(gpu){ncnn::create_gpu_instance();if(ncnn::get_gpu_count()<1)throw std::runtime_error("No compatible Vulkan GPU was found");vulkan=true;device=ncnn::get_gpu_info(ncnn::get_default_gpu_index()).device_name();}
#else
 if(gpu)throw std::runtime_error("This runtime does not support Vulkan");
#endif
 for(auto* net:{&detector,&recognizer}){net->opt.num_threads=threads;net->opt.use_vulkan_compute=vulkan;net->opt.use_fp16_packed=false;net->opt.use_fp16_storage=false;net->opt.use_fp16_arithmetic=false;net->opt.use_bf16_storage=false;}
 check(detector.load_param((root+"/det.ncnn.param").c_str()));check(detector.load_model((root+"/det.ncnn.bin").c_str()));
 check(recognizer.load_param((root+"/rec.ncnn.param").c_str()));check(recognizer.load_model((root+"/rec.ncnn.bin").c_str()));
 std::ifstream input(root+"/dictionary.json");if(!input)throw std::runtime_error("OCR dictionary is missing");dictionary=Json::parse(input).get<std::vector<std::string>>();
 if(dictionary.size()!=838||!dictionary[0].empty()||dictionary.back()!=" ")throw std::runtime_error("OCR dictionary does not match the Latin model");
}
Json Engine::info()const{return {{"ready",true},{"backend",vulkan?"vulkan":"cpu"},{"device",device},{"classes",dictionary.size()},{"model","ppocr-v5-latin-f32-v1"}};}
std::vector<Line> Engine::detect(const cv::Mat& image){
 const float scale=std::min(1.f,960.f/std::max(image.cols,image.rows));const int w=std::max(32,int(image.cols*scale)),h=std::max(32,int(image.rows*scale)),wp=(32-w%32)%32,hp=(32-h%32)%32;
 ncnn::Mat pixels=ncnn::Mat::from_pixels_resize(image.data,ncnn::Mat::PIXEL_BGR,image.cols,image.rows,w,h),input;
 ncnn::copy_make_border(pixels,input,hp/2,hp-hp/2,wp/2,wp-wp/2,ncnn::BORDER_CONSTANT,114.f);
 const float means[]={.485f*255,.456f*255,.406f*255},norms[]={1.f/.229f/255,1.f/.224f/255,1.f/.225f/255};input.substract_mean_normalize(means,norms);
 auto ex=detector.create_extractor();check(ex.input("in0",input));ncnn::Mat output;check(ex.extract("out0",output));
 if(output.w!=input.w||output.h!=input.h||output.c!=1)throw std::runtime_error("Unexpected detector shape");
 cv::Mat probabilities(output.h,output.w,CV_32FC1,output.data),binary;cv::compare(probabilities,.3,binary,cv::CMP_GT);
 std::vector<std::vector<cv::Point>> contours;cv::findContours(binary,contours,cv::RETR_LIST,cv::CHAIN_APPROX_SIMPLE);
 if(contours.size()>4096)throw std::runtime_error("Too many text regions; use a smaller page");
 std::vector<Line> lines;
 for(const auto& contour:contours){
  if(cancelled)throw std::runtime_error("OCR cancelled");if(contour.size()<3||std::abs(cv::contourArea(contour))<4)continue;
  auto bounds=cv::boundingRect(contour)&cv::Rect(0,0,output.w,output.h);if(bounds.empty())continue;
  cv::Mat mask=cv::Mat::zeros(bounds.size(),CV_8UC1);std::vector<cv::Point> local;for(auto p:contour)local.emplace_back(p-bounds.tl());cv::fillPoly(mask,std::vector<std::vector<cv::Point>>{local},cv::Scalar(255));
  float score=float(cv::mean(probabilities(bounds),mask)[0]);if(score<.6f)continue;
  const double perimeter=cv::arcLength(contour,true),distance=std::abs(cv::contourArea(contour))*1.5/perimeter;
  Clipper2Lib::PathD path;for(auto p:contour)path.emplace_back(p.x,p.y);
  auto expanded=Clipper2Lib::InflatePaths(Clipper2Lib::PathsD{path},distance,Clipper2Lib::JoinType::Round,Clipper2Lib::EndType::Polygon);
  if(expanded.size()!=1||expanded[0].size()<3)continue;
  std::vector<cv::Point2f> polygon;for(auto p:expanded[0])polygon.emplace_back(float((p.x-wp/2)/scale),float((p.y-hp/2)/scale));
  auto rect=cv::minAreaRect(polygon);if(std::min(rect.size.width,rect.size.height)<3)continue;lines.push_back({rect,"",score});
 }return lines;
}
void Engine::recognize(const cv::Mat& image,Line& line){
 cv::Point2f corners[4];line.rect.points(corners);std::sort(corners,corners+4,[](auto a,auto b){return a.x<b.x;});
 cv::Point2f tl=corners[0].y<corners[1].y?corners[0]:corners[1],bl=corners[0].y<corners[1].y?corners[1]:corners[0],tr=corners[2].y<corners[3].y?corners[2]:corners[3],br=corners[2].y<corners[3].y?corners[3]:corners[2];
 int width=std::max(2,int(std::max(cv::norm(tr-tl),cv::norm(br-bl)))),height=std::max(2,int(std::max(cv::norm(bl-tl),cv::norm(br-tr))));
 if(width>8192||height>8192)throw std::runtime_error("Text region is too large");
 std::vector<cv::Point2f> source={tl,tr,br,bl},target={{0,0},{float(width-1),0},{float(width-1),float(height-1)},{0,float(height-1)}};
 cv::Mat crop;cv::warpPerspective(image,crop,cv::getPerspectiveTransform(source,target),{width,height},cv::INTER_LINEAR,cv::BORDER_REPLICATE);
 if(height>width*1.5){cv::rotate(crop,crop,cv::ROTATE_90_COUNTERCLOCKWISE);std::swap(width,height);}
 const int resized=std::max(16,std::min(2560,int(std::ceil(width*48.f/height/8))*8));
 ncnn::Mat input=ncnn::Mat::from_pixels_resize(crop.data,ncnn::Mat::PIXEL_BGR,crop.cols,crop.rows,resized,48);const float means[]={127.5f,127.5f,127.5f},norms[]={1/127.5f,1/127.5f,1/127.5f};input.substract_mean_normalize(means,norms);
 auto ex=recognizer.create_extractor();check(ex.input("in0",input));ncnn::Mat output;check(ex.extract("out0",output));
 if(output.w!=int(dictionary.size())||output.h<1)throw std::runtime_error("Recognizer shape does not match the Latin dictionary");
 int last=-1,count=0;double confidence=0;
 for(int i=0;i<output.h;i++){const float* row=output.row(i);int token=int(std::max_element(row,row+output.w)-row);if(token!=last&&token>0){line.text+=dictionary[token];confidence+=row[token];count++;}last=token;}
 line.confidence=count?float(confidence/count):0;
}
// Recursive whitespace partitioning keeps large column gaps separate. It is a
// bounded geometric reading-order heuristic, not learned document layout.
static void order(std::vector<Line>& lines,int depth=0){
 if(lines.size()<2||depth>20)return;
 float best=0;int axis=-1;float cut=0;std::vector<float> heights;for(const auto& line:lines)heights.push_back(std::min(line.rect.size.width,line.rect.size.height));std::sort(heights.begin(),heights.end());const float unit=std::max(3.f,heights[heights.size()/2]);
 for(int dimension:{0,1}){std::vector<std::pair<float,float>> spans;for(const auto& line:lines){auto b=line.rect.boundingRect2f();spans.push_back(dimension==0?std::make_pair(b.x,b.x+b.width):std::make_pair(b.y,b.y+b.height));}std::sort(spans.begin(),spans.end());float end=spans[0].second;for(size_t i=1;i<spans.size();i++){float gap=(spans[i].first-end)/unit,threshold=dimension==0?1.6f:1.0f;if(gap>threshold&&gap>best){best=gap;axis=dimension;cut=(end+spans[i].first)/2;}end=std::max(end,spans[i].second);}}
 if(axis>=0){std::vector<Line> first,second;for(auto& line:lines)((axis==0?line.rect.center.x:line.rect.center.y)<cut?first:second).push_back(std::move(line));if(!first.empty()&&!second.empty()){order(first,depth+1);order(second,depth+1);lines=std::move(first);lines.insert(lines.end(),std::make_move_iterator(second.begin()),std::make_move_iterator(second.end()));return;}}
 std::stable_sort(lines.begin(),lines.end(),[unit](const Line&a,const Line&b){return std::floor(a.rect.center.y/unit)!=std::floor(b.rect.center.y/unit)?a.rect.center.y<b.rect.center.y:a.rect.center.x<b.rect.center.x;});
}
Json Engine::run(const cv::Mat& image){
 if(image.empty()||image.type()!=CV_8UC3||image.total()>16777216)throw std::runtime_error("Use an image up to 16 megapixels");
 cancelled=false;const auto started=std::chrono::steady_clock::now();auto lines=detect(image);
 for(auto& line:lines){if(cancelled)throw std::runtime_error("OCR cancelled");recognize(image,line);}order(lines);
 Json regions=Json::array();std::string text;for(const auto& line:lines){if(line.text.empty())continue;if(!text.empty())text+='\n';text+=line.text;if(text.size()>2048000)throw std::runtime_error("OCR text exceeds the limit");cv::Point2f points[4];line.rect.points(points);Json polygon=Json::array();for(auto p:points)polygon.push_back({std::clamp(p.x/image.cols,0.f,1.f),std::clamp(p.y/image.rows,0.f,1.f)});regions.push_back({{"text",line.text},{"confidence",line.confidence},{"polygon",polygon}});}
 if(cancelled)throw std::runtime_error("OCR cancelled");auto result=info();result["text"]=text;result["regions"]=regions;result["milliseconds"]=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-started).count();return result;
}
}
