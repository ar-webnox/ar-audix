import { useEffect, useState } from 'react';
import { db } from '../lib/db';
import { readTags, type Tags } from '../lib/tags';

/** Embedded tags read this session, by track id. Display only: never written to the library. */
const cache = new Map<string, Tags>();
const pending = new Map<string, Promise<Tags>>();

function loadTags(id: string): Promise<Tags> {
  let job = pending.get(id);
  if (!job) {
    job = db
      .getFile(id)
      .then((file) => (file ? readTags(file) : {}))
      .catch(() => ({}) as Tags)
      .then((tags) => {
        cache.set(id, tags);
        return tags;
      })
      .finally(() => pending.delete(id));
    pending.set(id, job);
  }
  return job;
}

/** The track's embedded Title/Artist, or null while they are still being read. */
export function useTags(id: string): Tags | null {
  const [tags, setTags] = useState<Tags | null>(() => cache.get(id) ?? null);
  useEffect(() => {
    const known = cache.get(id);
    if (known) {
      setTags(known);
      return;
    }
    setTags(null);
    let live = true;
    void loadTags(id).then((t) => live && setTags(t));
    return () => {
      live = false;
    };
  }, [id]);
  return tags;
}
