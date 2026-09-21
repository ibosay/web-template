/**
 * Stores the frames of a recorded drive in the browser of the phone.
 *
 * The frames stay on the device. IndexedDB is used rather than the smaller web storages because a
 * recording runs to a few hundred pictures, and it keeps them across a reload, so a drive survives
 * the phone deciding to reclaim the page.
 *
 * The pictures and their descriptions live in two stores. A review screen needs to list a few
 * hundred descriptions at once but only ever shows one picture at a time, and IndexedDB can only
 * read a whole record, so keeping them apart avoids pulling fifteen megabytes into memory to draw
 * a list.
 */

const DATABASE_NAME = 'trafficSignAssist';
const DATABASE_VERSION = 1;

/** The pictures, keyed by frame id. */
const PICTURE_STORE = 'framePictures';

/** What was going on when the picture was taken, keyed by the same id. */
const META_STORE = 'frameMeta';

/** Turns a single IndexedDB request into a promise. */
const fromRequest = request =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/**
 * Whether this browser can store a recording at all.
 *
 * @returns {boolean} true if IndexedDB is available
 */
export const isStorageAvailable = () => {
  try {
    return typeof window !== 'undefined' && !!window.indexedDB;
  } catch (e) {
    // Reading `indexedDB` itself throws in some privacy modes.
    return false;
  }
};

/**
 * Opens the database, creating it on first use.
 *
 * @returns {Promise<Object>} the open database
 */
export const openStore = () => {
  if (!isStorageAvailable()) {
    return Promise.reject(new Error('IndexedDB is not available'));
  }

  const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(PICTURE_STORE)) {
      database.createObjectStore(PICTURE_STORE);
    }
    if (!database.objectStoreNames.contains(META_STORE)) {
      database.createObjectStore(META_STORE);
    }
  };
  return fromRequest(request);
};

/**
 * Stores one frame.
 *
 * @param {Object} database - The open database
 * @param {number} id - The id to store it under
 * @param {Blob} picture - The picture, as a JPEG
 * @param {Object} meta - What was going on when it was taken
 * @returns {Promise<void>} resolves once the frame is written
 */
export const putFrame = (database, id, picture, meta) =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction([PICTURE_STORE, META_STORE], 'readwrite');
    transaction.objectStore(PICTURE_STORE).put(picture, id);
    transaction.objectStore(META_STORE).put(meta, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

/**
 * Reads the description of every stored frame, oldest first.
 *
 * @param {Object} database - The open database
 * @returns {Promise<Array<Object>>} the descriptions, each carrying its `id`
 */
export const listFrameMeta = async database => {
  const store = database.transaction(META_STORE, 'readonly').objectStore(META_STORE);
  const [ids, values] = await Promise.all([
    fromRequest(store.getAllKeys()),
    fromRequest(store.getAll()),
  ]);
  return values.map((value, index) => ({ ...value, id: ids[index] }));
};

/**
 * Reads one picture.
 *
 * @param {Object} database - The open database
 * @param {number} id - The frame to read
 * @returns {Promise<Blob|undefined>} the picture
 */
export const getFramePicture = (database, id) =>
  fromRequest(
    database
      .transaction(PICTURE_STORE, 'readonly')
      .objectStore(PICTURE_STORE)
      .get(id)
  );

/**
 * How many frames are stored.
 *
 * @param {Object} database - The open database
 * @returns {Promise<number>} the number of frames
 */
export const countFrames = database =>
  fromRequest(
    database
      .transaction(META_STORE, 'readonly')
      .objectStore(META_STORE)
      .count()
  );

/**
 * Throws the whole recording away.
 *
 * @param {Object} database - The open database
 * @returns {Promise<void>} resolves once nothing is left
 */
export const clearFrames = database =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction([PICTURE_STORE, META_STORE], 'readwrite');
    transaction.objectStore(PICTURE_STORE).clear();
    transaction.objectStore(META_STORE).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
