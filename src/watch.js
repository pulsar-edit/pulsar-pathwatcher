// So... we will use the global `atom` export inside Pulsar to watch directories
// and paths. There's only one problem: Atom's "export" handler actually depends on...
// ....
// You guessed right: Pathwatcher. But it actually DON'T USE the "watcher" part of
// pathwatcher, just Directory and File. So... we delay the require, hopefully
// so that we don't blow up the whole thing.
let atomExported = null // This is SO WEIRD...

function watch(fileOrDir, callback) {
  if(atomExported === null) atomExported = require('atom')
  const watcher = atomExported.watchPath(fileOrDir, {}, events => {
    events.forEach(event => {
      let eventName;
      if(event.action === 'created') eventName = 'rename'
      else if(event.action === 'deleted') eventName = 'delete'
      else eventName = 'change'
      callback(eventName, event.path)
    })
  })
  return {
    close: () => {
      watcher.then(w => w.dispose())
    }
  }
}

module.exports.watch = watch
