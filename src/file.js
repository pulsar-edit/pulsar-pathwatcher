const crypto = require('crypto');
const path = require('path');
const _ = require('underscore-plus');
const {Emitter, Disposable} = require('event-kit');
const fs = require('fs-plus');
const Grim = require('grim');
const iconv = null; // Defer until used
const Directory = require('./directory');
const PathWatcher = require('./index');

// Extended: Represents an individual file that can be watched, read from, and
// written to.
module.exports = class File {
  /*
  Section: Construction
  */
  // Public: Configures a new File instance, no files are accessed.

  // * `filePath` A {String} containing the absolute path to the file
  // * `symlink` (optional) A {Boolean} indicating if the path is a symlink (default: false).
  constructor(filePath, symlink = false) {
    this.encoding = 'utf8';
    this.realPath = null;
    this.subscriptionCount = 0;

    this.symlink = symlink;
    if (filePath) {
      filePath = path.normalize(filePath);
    }
    this.path = filePath;
    this.emitter = new Emitter();
    this.cachedContents = null;
    this.reportOnDeprecations = true;
  }

  // Public: Creates the file on disk that corresponds to `::getPath()` if no
  // such file already exists.

  // Returns a {Promise} that resolves once the file is created on disk. It
  // resolves to a boolean value that is true if the file was created or false if
  // it already existed.
  create() {
    return this.exists().then((isExistingFile) => {
      var parent;
      if (!isExistingFile) {
        parent = this.getParent();
        return parent.create().then(() => {
          return this.write('').then(function() {
            return true;
          });
        });
      } else {
        return false;
      }
    });
  }

  /*
  Section: Event Subscription
  */
  // Public: Invoke the given callback when the file's contents change.

  // * `callback` {Function} to be called when the file's contents change.

  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidChange(callback) {
    this.willAddSubscription();
    return this.trackUnsubscription(this.emitter.on('did-change', callback));
  }

  // Public: Invoke the given callback when the file's path changes.

  // * `callback` {Function} to be called when the file's path changes.

  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidRename(callback) {
    this.willAddSubscription();
    return this.trackUnsubscription(this.emitter.on('did-rename', callback));
  }

  // Public: Invoke the given callback when the file is deleted.

  // * `callback` {Function} to be called when the file is deleted.

  // Returns a {Disposable} on which `.dispose()` can be called to unsubscribe.
  onDidDelete(callback) {
    this.willAddSubscription();
    return this.trackUnsubscription(this.emitter.on('did-delete', callback));
  }

  // Public: Invoke the given callback when there is an error with the watch.
  // When your callback has been invoked, the file will have unsubscribed from
  // the file watches.

  // * `callback` {Function} callback
  //   * `errorObject` {Object}
  //     * `error` {Object} the error object
  //     * `handle` {Function} call this to indicate you have handled the error.
  //       The error will not be thrown if this function is called.
  onWillThrowWatchError(callback) {
    return this.emitter.on('will-throw-watch-error', callback);
  }

  willAddSubscription() {
    this.subscriptionCount++;
    try {
      return this.subscribeToNativeChangeEvents();
    } catch (error1) {}
  }

  didRemoveSubscription() {
    this.subscriptionCount--;
    if (this.subscriptionCount === 0) {
      return this.unsubscribeFromNativeChangeEvents();
    }
  }

  trackUnsubscription(subscription) {
    return new Disposable(() => {
      subscription.dispose();
      return this.didRemoveSubscription();
    });
  }

  /*
  Section: File Metadata
  */
  // Public: Returns a {Boolean}, always true.
  isFile() {
    return true;
  }

  // Public: Returns a {Boolean}, always false.
  isDirectory() {
    return false;
  }

  // Public: Returns a {Boolean} indicating whether or not this is a symbolic link
  isSymbolicLink() {
    return this.symlink;
  }

  // Public: Returns a promise that resolves to a {Boolean}, true if the file
  // exists, false otherwise.
  exists() {
    return new Promise((resolve) => {
      return fs.exists(this.getPath(), resolve);
    });
  }

  // Public: Returns a {Boolean}, true if the file exists, false otherwise.
  existsSync() {
    return fs.existsSync(this.getPath());
  }

  // Public: Get the SHA-1 digest of this file

  // Returns a promise that resolves to a {String}.
  getDigest() {
    if (this.digest != null) {
      return Promise.resolve(this.digest);
    } else {
      return this.read().then(() => {
        return this.digest; // read assigns digest as a side-effect
      });
    }
  }


    // Public: Get the SHA-1 digest of this file

  // Returns a {String}.
  getDigestSync() {
    if (!this.digest) {
      this.readSync();
    }
    return this.digest;
  }

  setDigest(contents) {
    return this.digest = crypto.createHash('sha1').update(contents != null ? contents : '').digest('hex');
  }

  // Public: Sets the file's character set encoding name.

  // * `encoding` The {String} encoding to use (default: 'utf8')
  setEncoding(encoding = 'utf8') {
    // Throws if encoding doesn't exist. Better to throw an exception early
    // instead of waiting until the file is saved.
    if (encoding !== 'utf8') {
      if (iconv == null) {
        iconv = require('iconv-lite');
      }
      iconv.getCodec(encoding);
    }
    return this.encoding = encoding;
  }

  // Public: Returns the {String} encoding name for this file (default: 'utf8').
  getEncoding() {
    return this.encoding;
  }

  /*
  Section: Managing Paths
  */
  // Public: Returns the {String} path for the file.
  getPath() {
    return this.path;
  }

  // Sets the path for the file.
  setPath(path1) {
    this.path = path1;
    return this.realPath = null;
  }

  // Public: Returns this file's completely resolved {String} path.
  getRealPathSync() {
    var error;
    if (this.realPath == null) {
      try {
        this.realPath = fs.realpathSync(this.path);
      } catch (error1) {
        error = error1;
        this.realPath = this.path;
      }
    }
    return this.realPath;
  }

  // Public: Returns a promise that resolves to the file's completely resolved {String} path.
  getRealPath() {
    if (this.realPath != null) {
      return Promise.resolve(this.realPath);
    } else {
      return new Promise((resolve, reject) => {
        return fs.realpath(this.path, (err, result) => {
          if (err != null) {
            return reject(err);
          } else {
            return resolve(this.realPath = result);
          }
        });
      });
    }
  }

  // Public: Return the {String} filename without any directory information.
  getBaseName() {
    return path.basename(this.path);
  }

  /*
  Section: Traversing
  */
  // Public: Return the {Directory} that contains this file.
  getParent() {
    if (Directory == null) {
      Directory = require('./directory');
    }
    return new Directory(path.dirname(this.path));
  }

  /*
  Section: Reading and Writing
  */
  readSync(flushCache) {
    var encoding;
    if (!this.existsSync()) {
      this.cachedContents = null;
    } else if ((this.cachedContents == null) || flushCache) {
      encoding = this.getEncoding();
      if (encoding === 'utf8') {
        this.cachedContents = fs.readFileSync(this.getPath(), encoding);
      } else {
        if (iconv == null) {
          iconv = require('iconv-lite');
        }
        this.cachedContents = iconv.decode(fs.readFileSync(this.getPath()), encoding);
      }
    }
    this.setDigest(this.cachedContents);
    return this.cachedContents;
  }

  writeFileSync(filePath, contents) {
    var encoding;
    encoding = this.getEncoding();
    if (encoding === 'utf8') {
      return fs.writeFileSync(filePath, contents, {encoding});
    } else {
      if (iconv == null) {
        iconv = require('iconv-lite');
      }
      return fs.writeFileSync(filePath, iconv.encode(contents, encoding));
    }
  }

  // Public: Reads the contents of the file.

  // * `flushCache` A {Boolean} indicating whether to require a direct read or if
  //   a cached copy is acceptable.

  // Returns a promise that resolves to either a {String}, or null if the file does not exist.
  read(flushCache) {
    var promise;
    if ((this.cachedContents != null) && !flushCache) {
      promise = Promise.resolve(this.cachedContents);
    } else {
      promise = new Promise((resolve, reject) => {
        var content, readStream;
        content = [];
        readStream = this.createReadStream();
        readStream.on('data', function(chunk) {
          return content.push(chunk);
        });
        readStream.on('end', function() {
          return resolve(content.join(''));
        });
        return readStream.on('error', function(error) {
          if (error.code === 'ENOENT') {
            return resolve(null);
          } else {
            return reject(error);
          }
        });
      });
    }
    return promise.then((contents) => {
      this.setDigest(contents);
      return this.cachedContents = contents;
    });
  }

  // Public: Returns a stream to read the content of the file.

  // Returns a {ReadStream} object.
  createReadStream() {
    var encoding;
    encoding = this.getEncoding();
    if (encoding === 'utf8') {
      return fs.createReadStream(this.getPath(), {encoding});
    } else {
      if (iconv == null) {
        iconv = require('iconv-lite');
      }
      return fs.createReadStream(this.getPath()).pipe(iconv.decodeStream(encoding));
    }
  }

  // Public: Overwrites the file with the given text.

  // * `text` The {String} text to write to the underlying file.

  // Returns a {Promise} that resolves when the file has been written.
  write(text) {
    return this.exists().then((previouslyExisted) => {
      return this.writeFile(this.getPath(), text).then(() => {
        this.cachedContents = text;
        this.setDigest(text);
        if (!previouslyExisted && this.hasSubscriptions()) {
          this.subscribeToNativeChangeEvents();
        }
        return void 0;
      });
    });
  }

  // Public: Returns a stream to write content to the file.

  // Returns a {WriteStream} object.
  createWriteStream() {
    var encoding, stream;
    encoding = this.getEncoding();
    if (encoding === 'utf8') {
      return fs.createWriteStream(this.getPath(), {encoding});
    } else {
      if (iconv == null) {
        iconv = require('iconv-lite');
      }
      stream = iconv.encodeStream(encoding);
      stream.pipe(fs.createWriteStream(this.getPath()));
      return stream;
    }
  }

  // Public: Overwrites the file with the given text.

  // * `text` The {String} text to write to the underlying file.

  // Returns undefined.
  writeSync(text) {
    var previouslyExisted;
    previouslyExisted = this.existsSync();
    this.writeFileSync(this.getPath(), text);
    this.cachedContents = text;
    this.setDigest(text);
    if (Grim.includeDeprecatedAPIs) {
      this.emit('contents-changed');
    }
    this.emitter.emit('did-change');
    if (!previouslyExisted && this.hasSubscriptions()) {
      this.subscribeToNativeChangeEvents();
    }
    return void 0;
  }

  writeFile(filePath, contents) {
    var encoding;
    encoding = this.getEncoding();
    if (encoding === 'utf8') {
      return new Promise(function(resolve, reject) {
        return fs.writeFile(filePath, contents, {encoding}, function(err, result) {
          if (err != null) {
            return reject(err);
          } else {
            return resolve(result);
          }
        });
      });
    } else {
      if (iconv == null) {
        iconv = require('iconv-lite');
      }
      return new Promise(function(resolve, reject) {
        return fs.writeFile(filePath, iconv.encode(contents, encoding), function(err, result) {
          if (err != null) {
            return reject(err);
          } else {
            return resolve(result);
          }
        });
      });
    }
  }

  /*
  Section: Private
  */
  handleNativeChangeEvent(eventType, eventPath) {
    switch (eventType) {
      case 'delete':
        this.unsubscribeFromNativeChangeEvents();
        return this.detectResurrectionAfterDelay();
      case 'rename':
        this.setPath(eventPath);
        if (Grim.includeDeprecatedAPIs) {
          this.emit('moved');
        }
        return this.emitter.emit('did-rename');
      case 'change':
      case 'resurrect':
        this.cachedContents = null;
        return this.emitter.emit('did-change');
    }
  }

  detectResurrectionAfterDelay() {
    return setTimeout(() => this.detectResurrection(), 50);
  }

  detectResurrection() {
    return this.exists().then((exists) => {
      if (exists) {
        this.subscribeToNativeChangeEvents();
        return this.handleNativeChangeEvent('resurrect');
      } else {
        this.cachedContents = null;
        if (Grim.includeDeprecatedAPIs) {
          this.emit('removed');
        }
        return this.emitter.emit('did-delete');
      }
    });
  }

  subscribeToNativeChangeEvents() {
    return this.watchSubscription != null ? this.watchSubscription : this.watchSubscription = PathWatcher.watch(this.path, (...args) => {
      return this.handleNativeChangeEvent(...args);
    });
  }

  unsubscribeFromNativeChangeEvents() {
    if (this.watchSubscription != null) {
      this.watchSubscription.close();
      return this.watchSubscription = null;
    }
  }

  hasSubscriptions() {
    return this.subscriptionCount > 0;
  }
}
