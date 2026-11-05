// Desktop Windows Hello requires the HWND interop API, not the UWP consent API.
// https://learn.microsoft.com/windows/win32/api/userconsentverifierinterop/nf-userconsentverifierinterop-iuserconsentverifierinterop-requestverificationforwindowasync
#include <windows.h>
#include <roapi.h>
#include <windows.foundation.h>
#include <windows.security.credentials.ui.h>
#include <UserConsentVerifierInterop.h>
#include <wrl.h>
#include <wrl/wrappers/corewrappers.h>
#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <cwchar>
#include <iostream>
#include <thread>
#include <string>
using Microsoft::WRL::ComPtr;
using Microsoft::WRL::Wrappers::HStringReference;
using namespace ABI::Windows::Foundation;
using namespace ABI::Windows::Security::Credentials::UI;
template<class Result> int waitFor(ComPtr<IAsyncOperation<Result>> operation) {
  ComPtr<IAsyncInfo> info;
  if (FAILED(operation.As(&info))) return 99;
  const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(55);
  for (;;) {
    AsyncStatus status=AsyncStatus::Started;
    if (FAILED(info->get_Status(&status))) return 99;
    if (status==AsyncStatus::Completed) {Result result;return SUCCEEDED(operation->GetResults(&result))?static_cast<int>(result):99;}
    if (status!=AsyncStatus::Started) return 99;
    if (std::chrono::steady_clock::now()>=deadline) {info->Cancel();return 99;}
    std::this_thread::sleep_for(std::chrono::milliseconds(40));
  }
}
int wmain(int argc,wchar_t** argv) {
  if (FAILED(RoInitialize(RO_INIT_MULTITHREADED))) {std::cout<<99;return 0;}
  int result=99;
  {
    ComPtr<IUserConsentVerifierInterop> interop;
    const auto className=HStringReference(RuntimeClass_Windows_Security_Credentials_UI_UserConsentVerifier);
    if (SUCCEEDED(RoGetActivationFactory(className.Get(),IID_PPV_ARGS(&interop)))) {
      if (argc==2&&std::wstring(argv[1])==L"--check") {
        ComPtr<IUserConsentVerifierStatics> statics;ComPtr<IAsyncOperation<UserConsentVerifierAvailability>> operation;
        if(SUCCEEDED(RoGetActivationFactory(className.Get(),IID_PPV_ARGS(&statics)))&&SUCCEEDED(statics->CheckAvailabilityAsync(&operation)))result=waitFor(operation);
      } else if (argc==3&&std::wstring(argv[1])==L"--verify") {
        wchar_t* end=nullptr;const auto value=std::wcstoull(argv[2],&end,10);const auto window=reinterpret_cast<HWND>(static_cast<std::uintptr_t>(value));
        if(value&&end&&!*end&&IsWindow(window)) {
          ComPtr<IAsyncOperation<UserConsentVerificationResult>> operation;
          if(SUCCEEDED(interop->RequestVerificationForWindowAsync(window,HStringReference(L"Unlock protected Chatbox Venice content").Get(),IID_PPV_ARGS(&operation))))result=waitFor(operation);
        }
      }
    }
  }
  RoUninitialize();std::cout<<result;return 0;
}
