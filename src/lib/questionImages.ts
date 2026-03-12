const QUESTION_IMAGE_MAX_EDGE = 1280
const QUESTION_IMAGE_MAX_BYTES = 220 * 1024
const SCALE_STEPS = [1, 0.86, 0.74, 0.62]
const QUALITY_STEPS = [0.82, 0.74, 0.66, 0.58, 0.5]

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('画像の読み込みに失敗しました。'))
    }
    reader.onerror = () => reject(new Error('画像の読み込みに失敗しました。'))
    reader.readAsDataURL(file)
  })
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('画像を開けませんでした。'))
    image.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('画像の圧縮に失敗しました。'))
        return
      }
      resolve(blob)
    }, type, quality)
  })
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('画像データの変換に失敗しました。'))
    }
    reader.onerror = () => reject(new Error('画像データの変換に失敗しました。'))
    reader.readAsDataURL(blob)
  })
}

function fitImageSize(width: number, height: number, scaleStep: number) {
  const baseScale = Math.min(1, QUESTION_IMAGE_MAX_EDGE / Math.max(width, height))
  const targetScale = baseScale * scaleStep
  return {
    width: Math.max(1, Math.round(width * targetScale)),
    height: Math.max(1, Math.round(height * targetScale)),
  }
}

function formatQuestionImageSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export async function compressQuestionImageFile(file: File) {
  if (!file.type.startsWith('image/')) {
    throw new Error('画像ファイルを選んでください。')
  }

  const sourceDataUrl = await readFileAsDataUrl(file)
  const image = await loadImageElement(sourceDataUrl)
  let bestBlob: Blob | null = null
  let bestWidth = image.naturalWidth
  let bestHeight = image.naturalHeight

  for (const scaleStep of SCALE_STEPS) {
    const { width, height } = fitImageSize(image.naturalWidth, image.naturalHeight, scaleStep)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('画像処理に必要な Canvas を使えませんでした。')
    }

    context.clearRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    for (const quality of QUALITY_STEPS) {
      let blob: Blob

      try {
        blob = await canvasToBlob(canvas, 'image/webp', quality)
      } catch {
        blob = await canvasToBlob(canvas, 'image/jpeg', quality)
      }

      bestBlob = blob
      bestWidth = width
      bestHeight = height

      if (blob.size <= QUESTION_IMAGE_MAX_BYTES) {
        return {
          dataUrl: await blobToDataUrl(blob),
          width,
          height,
          bytes: blob.size,
          sizeLabel: formatQuestionImageSize(blob.size),
        }
      }
    }
  }

  if (!bestBlob) {
    throw new Error('画像の圧縮に失敗しました。')
  }

  return {
    dataUrl: await blobToDataUrl(bestBlob),
    width: bestWidth,
    height: bestHeight,
    bytes: bestBlob.size,
    sizeLabel: formatQuestionImageSize(bestBlob.size),
  }
}
