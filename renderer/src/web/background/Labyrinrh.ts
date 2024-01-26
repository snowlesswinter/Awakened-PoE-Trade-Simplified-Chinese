import { Host } from './IPC'
async function getLabyrinrhImage () {
  const imgArray: string[] = []
  const response = await Host.proxy('www.poelab.com/')
  if (response.ok) {
    const labweb = new DOMParser().parseFromString(await response.text(), 'text/html')
    for (const a of labweb.getElementById('recent-posts-6')!.querySelector('ul')!.querySelectorAll('a')) {
      const response = await Host.proxy(a.href.replace('https://', ''), { method: 'get', mode: 'no-cors' })
      const labweb = new DOMParser().parseFromString((await response.text()), 'text/html')
      const imgweb = labweb.getElementById('inner-zoomed-container')!.querySelector('img')!.src
      // imgArray.push('proxy/' + imgweb.replace('https://', ''))
      imgArray.push(imgweb)
    }
    // Host.logs.value += imgweb + '\n'
  }
  return imgArray
}
export let imgArray: string[]

export async function updateImage () {
  getLabyrinrhImage().then(value => {
    imgArray = value
  })
}
