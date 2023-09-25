import { Host } from './IPC'
async function getLabyrinrhImage () {
  const response = await Host.proxy('www.poelab.com/')
  if (response.ok) {
    const imgArray: string[] = []
    const labweb = new DOMParser().parseFromString(await response.text(), 'text/html')
    for (const a of labweb.getElementById('recent-posts-6')!.querySelector('ul')!.querySelectorAll('a')) {
      const response = await Host.proxy(a.href.replace('https://', ''))
      const labweb = new DOMParser().parseFromString((await response.text()), 'text/html')
      const imgweb = labweb.getElementById('inner-zoomed-container')!.querySelector('img')!.src
      // imgArray.push('proxy/' + imgweb.replace('https://', ''))
      imgArray.push(imgweb)
    }
    // Host.logs.value += imgweb + '\n'
    return imgArray
  }
}
export let imgArray = await getLabyrinrhImage()

export async function updateImage () {
  imgArray = await getLabyrinrhImage()
}
