#!/bin/sh
# Сборка kabinet_hd_6: 3-way merge копий motion, redesign, sound от базы v5
set -e
cd "$(dirname "$0")"
B=base/kabinet_hd_5.html
mkdir -p build
cp work/motion/kabinet.html build/step1.html
git merge-file -p build/step1.html "$B" work/redesign/kabinet.html > build/step2.html || echo "redesign: conflicts=$?"
# оба пакета дописывают <script> перед </body> — union оставляет оба, sound последним
git merge-file --union -p build/step2.html "$B" work/sound/kabinet.html > build/kabinet_hd_6.html || true
echo "conflict markers: $(grep -c '^<<<<<<<\|^>>>>>>>' build/kabinet_hd_6.html || true)"
grep -c 'id="p21-motion-js"\|id="p21-sound"\|id="p21-redesign"\|id="p21-fonts"' build/kabinet_hd_6.html
