{pkgs}: {
  deps = [
    pkgs.libgbm
    pkgs.libGL
    pkgs.systemd
    pkgs.dbus
    pkgs.cairo
    pkgs.pango
    pkgs.alsa-lib
    pkgs.mesa
    pkgs.libxkbcommon
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXext
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.xorg.libX11
    pkgs.xorg.libxcb
    pkgs.libdrm
    pkgs.cups
    pkgs.expat
    pkgs.at-spi2-atk
    pkgs.atk
    pkgs.nspr
    pkgs.nss
    pkgs.glib
  ];
}
