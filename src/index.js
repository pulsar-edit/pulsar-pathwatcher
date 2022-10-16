const nsfw = require('nsfw');

const evtMappings = new Map([
  [nsfw.actions.CREATED, 'create'],
  [nsfw.actions.MODIFIED, 'change'],
  [nsfw.actions.RENAMED, 'rename'],
  [nsfw.actions.DELETED, 'delete']
]);

function watch(fileOrDir, callback) {
  const watcher = nsfw(fileOrDir, events => {
    events.forEach(event => {
      const eventName = evtMappings.get(event.action);
      callback(eventName, event.file || event.newFile)
    })
  })
  watcher.then(w => w.start());
  return {
    close: () => {
      watcher.then(w => w.close())
    }
  }
}

module.exports.watch = watch
module.exports.watch = watch
module.exports.watch = watch
