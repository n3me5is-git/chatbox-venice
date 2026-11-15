#include "core.h"
#include <jni.h>
#include <android/bitmap.h>
#include <opencv2/imgproc/imgproc.hpp>
#include <memory>
#include <mutex>
#include <unordered_map>
namespace {
std::mutex mutex;std::unordered_map<jlong,std::shared_ptr<local_ocr::Engine>> engines;jlong sequence=0;
std::shared_ptr<local_ocr::Engine> engine(jlong id){std::lock_guard<std::mutex> lock(mutex);auto found=engines.find(id);if(found==engines.end())throw std::runtime_error("OCR engine was released");return found->second;}
void fail(JNIEnv* env,const std::exception& error){env->ThrowNew(env->FindClass("java/lang/IllegalStateException"),error.what());}
}
extern "C" JNIEXPORT jlong JNICALL Java_io_github_n3me5is_chatboxvenice_PaddleOCRPlugin_nativeCreate(JNIEnv* env,jclass,jstring root,jboolean gpu,jint threads){
 const char* value=env->GetStringUTFChars(root,nullptr);std::string directory(value);env->ReleaseStringUTFChars(root,value);
 try{auto created=std::make_shared<local_ocr::Engine>(directory,bool(gpu),int(threads));std::lock_guard<std::mutex> lock(mutex);jlong id=++sequence;engines[id]=std::move(created);return id;}catch(const std::exception& error){fail(env,error);return 0;}
}
extern "C" JNIEXPORT jstring JNICALL Java_io_github_n3me5is_chatboxvenice_PaddleOCRPlugin_nativeRun(JNIEnv* env,jclass,jlong id,jobject bitmap){
 try{auto current=engine(id);AndroidBitmapInfo info;if(AndroidBitmap_getInfo(env,bitmap,&info)!=ANDROID_BITMAP_RESULT_SUCCESS||info.format!=ANDROID_BITMAP_FORMAT_RGBA_8888||uint64_t(info.width)*info.height>16777216)throw std::runtime_error("Unsupported OCR image");void* pixels=nullptr;if(AndroidBitmap_lockPixels(env,bitmap,&pixels)!=ANDROID_BITMAP_RESULT_SUCCESS)throw std::runtime_error("Unable to read OCR image");cv::Mat bgr;try{cv::Mat rgba(info.height,info.width,CV_8UC4,pixels,info.stride);cv::cvtColor(rgba,bgr,cv::COLOR_RGBA2BGR);}catch(...){AndroidBitmap_unlockPixels(env,bitmap);throw;}AndroidBitmap_unlockPixels(env,bitmap);auto result=current->run(bgr).dump(-1,' ',true);return env->NewStringUTF(result.c_str());}catch(const std::exception& error){fail(env,error);return nullptr;}
}
extern "C" JNIEXPORT void JNICALL Java_io_github_n3me5is_chatboxvenice_PaddleOCRPlugin_nativeCancel(JNIEnv*,jclass,jlong id){try{engine(id)->cancelled=true;}catch(...){}}
extern "C" JNIEXPORT void JNICALL Java_io_github_n3me5is_chatboxvenice_PaddleOCRPlugin_nativeRelease(JNIEnv*,jclass,jlong id){std::lock_guard<std::mutex> lock(mutex);engines.erase(id);}
