#!/bin/bash
cd "$(dirname "$0")"
open "http://localhost:8794"
python3 -m http.server 8794
