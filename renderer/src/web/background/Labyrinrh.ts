import { Host } from './IPC'
export async function getLabyrinrhImage () {
  const response = await Host.proxy('www.poelab.com/')
  if (!response.ok) throw new Error(JSON.stringify(Object.fromEntries(response.headers)))
  const labweb = new DOMParser().parseFromString(await response.text(), 'text/html')
  const imgArray: string[] = []
  for (const a of labweb.getElementById('recent-posts-6')!.querySelector('ul')!.querySelectorAll('a')) {
    const response = await Host.proxy(a.href.replace('https://', ''))
    if (!response.ok) throw new Error(JSON.stringify(Object.fromEntries(response.headers)))
    const labweb = new DOMParser().parseFromString((await response.text()), 'text/html')
    const imgweb = labweb.getElementById('inner-zoomed-container')!.querySelector('img')!.src
    // imgArray.push('proxy/' + imgweb.replace('https://', ''))
    imgArray.push(imgweb)
    // Host.logs.value += imgweb + '\n'
  }
  return imgArray
}

export const imgArray: string[] = await getLabyrinrhImage()
