import fs from 'fs'
import path from 'path'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
const loader = new GLTFLoader()
const file = path.resolve('public/models/dummy.glb')
const arrayBuffer = await fs.promises.readFile(file)
const gltf = await new Promise((res, rej) => loader.parse(arrayBuffer.buffer, '', res, rej))
function fmt(value) {
  return Array.isArray(value)
    ? value.map((n) => (typeof n === 'number' ? n.toFixed(3) : String(n))).join(',')
    : String(value)
}
function print(node, indent = 0) {
  console.log(
    ' '.repeat(indent) +
      `${node.name || '<no-name>'} [${node.type}] pos=${fmt(node.position.toArray())} scale=${fmt(node.scale.toArray())} rot=${fmt(node.rotation.toArray())}`
  )
  node.children.forEach(c => print(c, indent + 2))
}
print(gltf.scene)
const box = new (await import('three')).Box3().setFromObject(gltf.scene)
console.log('--- bounding box ---')
console.log('min=' + box.min.toArray().map(n=>n.toFixed(3)).join(',') )
console.log('max=' + box.max.toArray().map(n=>n.toFixed(3)).join(',') )
console.log('size=' + box.getSize(new (await import('three')).Vector3()).toArray().map(n=>n.toFixed(3)).join(','))
console.log('--- meshes ---')
function printMeshes(node, indent = 0) {
  if (node.type === 'Mesh') {
    console.log(' '.repeat(indent) + `${node.name || '<no-name>'} geometry=${node.geometry?.type || '<no-geometry>'}`)
  }
  node.children.forEach(c => printMeshes(c, indent + 2))
}
printMeshes(gltf.scene)
