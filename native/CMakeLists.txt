# SPDX-License-Identifier: GPL-2.0
# Subsurface core (unmodified) + core/compat + façade + JNI bridge, for the NDK.
# Run by native/build-android.sh. Options taken from poc/build.sh.
cmake_minimum_required(VERSION 3.22)
project(benthic LANGUAGES C CXX)

get_filename_component(ROOT "${CMAKE_CURRENT_SOURCE_DIR}/.." ABSOLUTE)
set(SS "${ROOT}/third_party/subsurface")
set(COMPAT "${ROOT}/core/compat")

# List shared with poc/build.sh.
file(STRINGS "${COMPAT}/core-files.txt" CORE_FILES)
set(SOURCES "")
foreach(f ${CORE_FILES})
  list(APPEND SOURCES "${SS}/core/${f}.cpp")
endforeach()
list(APPEND SOURCES
  "${COMPAT}/qthelper_compat.cpp"
  "${COMPAT}/notifier_compat.cpp"
  "${COMPAT}/cloud_compat.cpp"
  "${COMPAT}/https_mbedtls.cpp"
  "${COMPAT}/bluetooth_compat.cpp"
  "${ROOT}/core/libbenthic/benthic.cpp"
  "${ROOT}/core/libbenthic/edit.cpp"
  "${ROOT}/core/libbenthic/tools.cpp"
  "${ROOT}/core/libbenthic/settings.cpp"
  "${ROOT}/core/libbenthic/plan.cpp"
  "${ROOT}/core/libbenthic/filter.cpp"
  "${ROOT}/core/libbenthic/account.cpp"
  "${ROOT}/core/libbenthic/stats.cpp"
  "${ROOT}/core/libbenthic/download.cpp"
  "${ROOT}/core/libbenthic/odgit.cpp"
  "${ROOT}/plugins/benthic-core/android/src/main/cpp/benthic_jni.cpp")

file(WRITE "${CMAKE_BINARY_DIR}/gen/build-defs.h" "#define SUBSURFACE_SOURCE \"\"\n")

add_library(benthic SHARED ${SOURCES})
target_compile_features(benthic PRIVATE cxx_std_20)
# Subsurface's Bluetooth paths in core/libdivecomputer.cpp, with the transport
# of core/compat/bluetooth_compat.cpp.
target_compile_definitions(benthic PRIVATE BT_SUPPORT BLE_SUPPORT)
target_compile_options(benthic PRIVATE
  -w -O2 -fvisibility=hidden
  "SHELL:-iquote ${COMPAT}/shadow"
  "SHELL:-include ${CMAKE_BINARY_DIR}/gen/build-defs.h")
target_include_directories(benthic PRIVATE
  "${COMPAT}/qtshim" "${COMPAT}/gen" "${CMAKE_BINARY_DIR}/gen"
  "${ROOT}" "${SS}" "${SS}/libdivecomputer/include"
  "${DEPS}/include" "${DEPS}/include/libxml2")
target_link_directories(benthic PRIVATE "${DEPS}/lib")
target_link_libraries(benthic PRIVATE divecomputer git2 mbedtls mbedx509 mbedcrypto zip xslt xml2 sqlite3 z m log)
target_link_options(benthic PRIVATE
  -Wl,--gc-sections -Wl,-z,max-page-size=16384 -Wl,--exclude-libs,ALL)
