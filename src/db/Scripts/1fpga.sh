#!/bin/bash

# If there's no MiSTer binary, we're not on a MiSTer system.
if [ ! -f "/media/fat/MiSTer" ];
then
  echo "This script must be run on a MiSTer system."
  read -r -p "Press enter to reboot."
  reboot
fi

# If there's already a 1FPGA binary, just run it. Updates are now
# part of 1FPGA itself.
if [ -f "/media/fat/one_fpga" ];
then
  echo "Starting 1FPGA"
  sync
  killall -9 MiSTer one_fpga
  cd /media/fat && (
    /media/fat/one_fpga
  )
  reboot
fi

# ELSE we need to download the latest 1FPGA release and install it.

# Download the release.
curl --insecure --fail-with-body -L "https://catalog.1fpga.cloud/stable/releases/1fpga/latest/one_fpga" -o /media/fat/one_fpga || (
  echo "Failed to download 1FPGA."
  read -r -p "Press enter to reboot."
  reboot
)

echo "Starting 1FPGA"

# Start 1FPGA.
sync
killall -9 MiSTer one_fpga
cd /media/fat && (
  /media/fat/one_fpga || (
    echo "Failed to start 1FPGA."
    read -r -p "Press enter to reboot."
  )
)

# Once this is done, reboot back into MiSTer.
reboot
