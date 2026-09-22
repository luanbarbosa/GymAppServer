# Image upscale scripts

`upscale-catalog-images.sh` and `upscale-animated-webp.sh` upscale exercise images below `MIN_WIDTH` using Real-ESRGAN. They expect the binary and models at `scripts/uppscaling/bin/` (gitignored, install locally).

## Setup

Install dependencies via Homebrew:

```
brew install imagemagick webp
```

`realesrgan-ncnn-vulkan` has no Homebrew formula, install manually:

```
mkdir -p scripts/uppscaling/bin
cd scripts/uppscaling/bin

# Download latest release for your platform (macOS example, arm64/Apple Silicon):
curl -L -o realesrgan.zip https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases/latest/download/realesrgan-ncnn-vulkan-20220424-macos.zip
unzip realesrgan.zip -d tmp
mv tmp/realesrgan-ncnn-vulkan .
mv tmp/models .
chmod +x realesrgan-ncnn-vulkan
rm -rf tmp realesrgan.zip
```

Check the [releases page](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases) for the current asset name/platform (Intel Mac, Linux, Windows differ).

Resulting layout:

```
scripts/uppscaling/bin/realesrgan-ncnn-vulkan
scripts/uppscaling/bin/models/
  realesrgan-x4plus.bin / .param
  realesrgan-x4plus-anime.bin / .param
  realesr-animevideov3-x2/x3/x4.bin / .param
```

## Run

```
scripts/uppscaling/upscale-catalog-images.sh
```

Rerunning is safe: it skips images already at/above `MIN_WIDTH` (checks each file's width before upscaling).
