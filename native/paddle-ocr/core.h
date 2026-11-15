#pragma once
#include <atomic>
#include <string>
#include <vector>
#include <net.h>
#include <opencv2/core/core.hpp>
#include <json.hpp>

namespace local_ocr {
using Json=nlohmann::json;
struct Line {cv::RotatedRect rect;std::string text;float confidence;};
class Engine {
 ncnn::Net detector,recognizer;
 std::vector<std::string> dictionary;
 bool vulkan=false;
 std::string device="CPU";
 std::vector<Line> detect(const cv::Mat& image);
 void recognize(const cv::Mat& image,Line& line);
public:
 std::atomic<bool> cancelled{false};
 Engine(const std::string& root,bool gpu,int threads);
 Json info()const;
 Json run(const cv::Mat& image);
};
}
