#!/bin/bash
# Setup proper automount for external drives with user permissions
# This ensures exFAT/FAT32/NTFS drives are mounted with write access

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Music Analyzer - Drive Automount Setup${NC}"
echo "========================================"
echo ""

# Get current user info
CURRENT_UID=$(id -u)
CURRENT_GID=$(id -g)
CURRENT_USER=$(whoami)

echo "Current user: ${CURRENT_USER} (UID: ${CURRENT_UID}, GID: ${CURRENT_GID})"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}Please run this script as your normal user (not root)${NC}"
    exit 1
fi

# Create udev rules for automounting with proper permissions
UDEV_RULE="/etc/udev/rules.d/99-usb-storage-permissions.rules"

echo -e "${YELLOW}This script will configure your system to automount USB drives with proper permissions.${NC}"
echo ""
echo "It will create: ${UDEV_RULE}"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Create udev rule
sudo tee "$UDEV_RULE" > /dev/null << EOF
# Auto-set permissions for USB storage devices
# Created by music-analyzer setup script

# For FAT/exFAT/NTFS filesystems, set mount options via udisks2
ENV{ID_FS_TYPE}=="vfat|exfat|ntfs", ENV{UDISKS_MOUNT_OPTIONS_DEFAULTS}="uid=${CURRENT_UID},gid=${CURRENT_GID},umask=0022"
EOF

echo -e "${GREEN}Created udev rule: ${UDEV_RULE}${NC}"

# Create udisks2 override for mount options
UDISKS_OVERRIDE_DIR="/etc/udisks2"
UDISKS_CONF="${UDISKS_OVERRIDE_DIR}/mount_options.conf"

sudo mkdir -p "$UDISKS_OVERRIDE_DIR"
sudo tee "$UDISKS_CONF" > /dev/null << EOF
# Mount options for USB storage
# Created by music-analyzer setup script

[defaults]
vfat_defaults=uid=${CURRENT_UID},gid=${CURRENT_GID},umask=0022,shortname=mixed,utf8=1
exfat_defaults=uid=${CURRENT_UID},gid=${CURRENT_GID},umask=0022
ntfs_defaults=uid=${CURRENT_UID},gid=${CURRENT_GID},umask=0022
EOF

echo -e "${GREEN}Created udisks2 config: ${UDISKS_CONF}${NC}"

# Reload udev rules
sudo udevadm control --reload-rules
sudo udevadm trigger

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Unplug and replug your USB drive"
echo "2. The drive should now mount with write permissions for user ${CURRENT_USER}"
echo ""
echo "If you have a drive already mounted, remount it with:"
echo "  sudo umount /media/${CURRENT_USER}/<drive-name>"
echo "  # Then unplug and replug the drive"
echo ""
echo "Or manually mount with:"
echo "  sudo mount -o uid=${CURRENT_UID},gid=${CURRENT_GID},umask=0022 /dev/sdX1 /media/${CURRENT_USER}/<mount-point>"
