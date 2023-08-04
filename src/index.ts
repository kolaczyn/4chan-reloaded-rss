import axios from 'axios'
import { Builder } from 'xml2js'
import express from 'express'
import NodeCache from 'node-cache'

const API_URL = 'https://api.kolaczyn.com/boards'

const appCache = new NodeCache({
  stdTTL: 60,
  checkperiod: 120,
})

type BoardsThreadsDto = {
  threads: Thread[]
  name: string
  slug: string
}

type Thread = {
  id: number
  message: string
  repliesCount: number
  createdAt: string | null
  imageUrl: string | null
}

type ThreadRepliesDto = {
  createdAt: string | null
  id: number
  replies: {
    id: number
    message: string
    createdAt: string | null
  }[]
  title: string
}

const generateBoardXml = async (boardSlug: string) => {
  console.info('making request for ' + boardSlug)
  const result = await axios.get<BoardsThreadsDto>(`${API_URL}/${boardSlug}?sortOrder=creationDate`).catch(_ => null)

  if (!result) {
    return null
  }

  const xmlBuilder = new Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
  })

  const rssFeed = {
    rss: {
      $: {
        'xmlns:atom': 'http://www.w3.org/2005/Atom',
        version: '2.0',
      },
      channel: {
        title: `/${result.data.slug}/ - ${result.data.name}`,
        description: 'Messageboard by kolaczyn',
        link: 'https://4chan.kolaczyn.com', // Change this to your website URL
        lastBuildDate: new Date().toUTCString(),
        item: result.data.threads.map(item => ({
          title: item.message,
          description: 'Reply count: ' + item.repliesCount,
          link: `https://4chan.kolaczyn.com/boards/${boardSlug}/${item.id}`,
          pubDate: new Date(item.createdAt ?? '').toUTCString(),
        })),
      },
    },
  }

  return xmlBuilder.buildObject(rssFeed)
}

const generateThreadXml = async (boardSlug: string, threadId: number) => {
  console.info(`making request for ${boardSlug} ${threadId}`)
  const result = await axios.get<ThreadRepliesDto>(`${API_URL}/${boardSlug}/threads/${threadId}`).catch(_ => null)

  if (!result) {
    return null
  }

  const xmlBuilder = new Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
  })

  const rssFeed = {
    rss: {
      $: {
        'xmlns:atom': 'http://www.w3.org/2005/Atom',
        version: '2.0',
      },
      channel: {
        title: `${result.data.title}/`,
        description: 'Messageboard by kolaczyn',
        link: 'https://4chan.kolaczyn.com', // Change this to your website URL
        lastBuildDate: new Date().toUTCString(),
        item: result.data.replies
          .map(item => ({
            title: item.message,
            link: `https://4chan.kolaczyn.com/boards/${boardSlug}/${threadId}#${item.id}`,
            pubDate: new Date(item.createdAt ?? '').toUTCString(),
          }))
          .slice()
          .reverse(),
      },
    },
  }

  return xmlBuilder.buildObject(rssFeed)
}

const app = express()

app.get('/:board/:threadId?', async (req, res) => {
  const { board, threadId } = req.params

  const key = `${board}-${threadId ?? ''}`

  const fromCache = appCache.get(key)
  if (fromCache !== undefined) {
    res.set('Content-Type', 'text/xml')
    return res.send(fromCache)
  }

  if (threadId) {
    const xml = await generateThreadXml(board, parseInt(threadId))
    appCache.set(key, xml)
  } else {
    const xml = await generateBoardXml(board)
    appCache.set(key, xml)
  }

  const xml = appCache.get(key)

  if (!xml) {
    res.status(404)
    return res.send('Not found')
  }

  res.set('Content-Type', 'text/xml')
  return res.send(xml)
})

const PORT = process.env.PORT ?? '8080'
app.listen(PORT, () => {
  console.info(`Server running on port http://localhost:${PORT}`)
})
