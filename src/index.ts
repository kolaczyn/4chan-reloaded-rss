import axios from 'axios'
import { Builder } from 'xml2js'
import express from 'express'
import NodeCache from 'node-cache'

const API_URL = 'https://api.kolaczyn.com/boards'

const appCache = new NodeCache({
  stdTTL: 60,
  checkperiod: 120,
})

type BoardDto = {
  name: string
  slug: string
}

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

const addCssToXml = (xml: string) =>
  xml.replace(
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet type="text/css" href="/xml-styles.css"?>'
  )

const fetchBoardsThreads = async (boardSlug: string) => {
  const result = await axios.get<BoardsThreadsDto>(`${API_URL}/${boardSlug}?sortOrder=creationDate`).catch(_ => null)

  if (!result) {
    return null
  }

  return result.data
}

const generateBoardsThreadsXml = async (boardSlug: string) => {
  console.info('making request for ' + boardSlug)
  const result = await fetchBoardsThreads(boardSlug)

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
        title: `/${result.slug}/ - ${result.name}`,
        description: 'Messageboard by kolaczyn',
        link: `https://4chan.kolaczyn.com/boards/${boardSlug}`,
        lastBuildDate: new Date().toUTCString(),
        item: result.threads.map(item => ({
          title: item.message,
          description: 'Reply count: ' + item.repliesCount,
          link: `https://4chan.kolaczyn.com/boards/${boardSlug}/${item.id}`,
          pubDate: new Date(item.createdAt ?? '').toUTCString(),
        })),
      },
    },
  }

  return addCssToXml(xmlBuilder.buildObject(rssFeed))
}

const fetchThreadsReplies = async (boardSlug: string, threadId: number) => {
  const response = await axios.get<ThreadRepliesDto>(`${API_URL}/${boardSlug}/threads/${threadId}`).catch(_ => null)

  if (!response) {
    return null
  }

  return response.data
}

const generateThreadsRepliesXml = async (boardSlug: string, threadId: number) => {
  console.info(`making request for ${boardSlug} ${threadId}`)
  const response = await fetchThreadsReplies(boardSlug, threadId)

  if (!response) {
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
        title: `${response.title}/`,
        description: 'Messageboard by kolaczyn',
        link: `https://4chan.kolaczyn.com/boards/${boardSlug}/${threadId}`, // Change this to your website URL
        lastBuildDate: new Date().toUTCString(),
        item: response.replies
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

  return addCssToXml(xmlBuilder.buildObject(rssFeed))
}

const fetchBoards = async () => {
  const response = await axios.get<BoardDto[]>(API_URL).catch(_ => null)

  if (!response) {
    return null
  }

  return response.data
}

const getCurrentDate = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const generateSitemap = async () => {
  const boardsResult = await fetchBoards()

  if (!boardsResult) {
    return null
  }

  const xmlBuilder = new Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
  })

  // the date is in this format: 2023-08-04
  const currentDate = getCurrentDate()

  const boardsSitemapEntries = boardsResult.map(item => ({
    loc: `https://4chan.kolaczyn.com/boards/${item.slug}`,
    lastmod: currentDate,
    changefreq: 'weekly',
  }))

  const sitemap = {
    sitemapindex: {
      $: {
        xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9',
      },
      sitemap: boardsSitemapEntries,
    },
  }

  return xmlBuilder.buildObject(sitemap)
}

const app = express()

app.use(express.static('public'))
app.get('/sitemap.xml', async (_req, res) => {
  const SITEMAP_CACHE_KEY = 'sitemap.xml'

  // const fromCache = appCache.get(SITEMAP_CACHE_KEY)
  // if (fromCache !== undefined) {
  //   res.set('Content-Type', 'text/xml')
  //   return res.send(fromCache)
  // }

  const sitemap = await generateSitemap()
  appCache.set(SITEMAP_CACHE_KEY, sitemap)

  res.set('Content-Type', 'text/xml')
  return res.send(sitemap)
})

app.get('/:board/:threadId?', async (req, res) => {
  const { board, threadId } = req.params

  const key = `${board}-${threadId ?? ''}`

  const fromCache = appCache.get(key)
  if (fromCache !== undefined) {
    res.set('Content-Type', 'text/xml')
    return res.send(fromCache)
  }

  if (threadId) {
    const xml = await generateThreadsRepliesXml(board, parseInt(threadId))
    appCache.set(key, xml)
  } else {
    const xml = await generateBoardsThreadsXml(board)
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
