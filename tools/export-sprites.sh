#!/bin/sh
# ส่งออกทุกไฟล์ใน art/sprites/*.aseprite เป็น sheet เดียว → game/sprites/sheet.png + sheet.json
# ชื่อไฟล์ = ชื่อ sprite ในเกม (york.aseprite แทน york) · วาดขนาดจริงตาม GDD-MVP (ตัวละครและ tile 32×32 · บอส 64×64)
# tag ท่าทาง idle_down / idle_up / idle_side (side หันขวา เกมกลับภาพเป็นซ้ายเอง) · ไม่แยกทิศก็ได้ เช่น idle
# ท่าที่เกมรู้จัก (สำคัญก่อน): down ล้ม · kneel คุกเข่า · hit โดนตี · dodge หลบ · attack ตี/ง้าง · walk เดิน · idle · ยังไม่วาดท่าไหน เกมใช้ท่าถัดไป
# รันจากที่ไหนก็ได้: sh tools/export-sprites.sh · ตั้ง ASEPRITE=... ถ้าลงไว้ที่อื่น
cd "$(dirname "$0")/.." || exit 1
ASEPRITE="${ASEPRITE:-/c/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe}"
# ภาพวาดมือของผู้ออกแบบใน art/HandDwaw ใช้แทนไฟล์ชื่อเดียวกันใน art/sprites (ไฟล์ไม่มี tag = ท่า idle) · ชื่อไฟล์:ชื่อ sprite
HAND="YorkRunn:york Atez:atez"
TMP=$(mktemp -d) && trap 'rm -rf "$TMP"' EXIT
cp art/sprites/*.aseprite "$TMP"/
for p in $HAND; do [ -e "art/HandDwaw/${p%%:*}.ase" ] && cp "art/HandDwaw/${p%%:*}.ase" "$TMP/${p#*:}.aseprite"; done
set -- "$TMP"/*.aseprite
[ -e "$1" ] || { echo "ไม่มีไฟล์ใน art/sprites/*.aseprite"; exit 1; }
mkdir -p game/sprites
"$ASEPRITE" -b "$@" --sheet game/sprites/sheet.png --data game/sprites/sheet.json \
  --format json-array --sheet-pack --split-tags --filename-format '{title}#{tag}#{tagframe}' && echo "ส่งออก $# ไฟล์ → game/sprites/sheet.png"
