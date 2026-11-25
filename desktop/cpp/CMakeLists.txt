cmake_minimum_required(VERSION 3.16)
project(AutoLabVCICore LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(autolab_vci SHARED vci_core.cpp)
set_target_properties(autolab_vci PROPERTIES OUTPUT_NAME "autolab_vci")
