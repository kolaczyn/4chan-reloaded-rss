import axios from 'axios'
import { Builder } from 'xml2js'
import fs from 'fs'

const API_URL = 'https://api.kolaczyn.com/boards'
const BOARD_TO_DOWNLOAD = 'a'

type Thread = {
  id: number
  message: string
  repliesCount: number
  createdAt: string | null
  imageUrl: string | null
}
const encodeXml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\t/g, '&#x9;')
    .replace(/\n/g, '&#xA;')
    .replace(/\r/g, '&#xD;')

// Convert the JavaScript object to XML

const main = async () => {
  // fetch threads
  const { data } = await axios.get<{ threads: Thread[] }>(`${API_URL}/${BOARD_TO_DOWNLOAD}`)

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
        title: 'Boards',
        description: 'Messageboard by kolaczyn',
        link: 'https://4chan.kolaczyn.com', // Change this to your website URL
        lastBuildDate: new Date().toUTCString(),
        item: data.threads.map(item => {
          return {
            title: encodeXml(item.message),
            description: 'Reply count: ' + item.repliesCount,
            link: `https://4chan.kolaczyn.com/boards/${BOARD_TO_DOWNLOAD}/${item.id}`,
            pubDate: new Date(item.createdAt ?? '').toUTCString(),
          }
        }),
      },
    },
  }

  const xml = xmlBuilder.buildObject(rssFeed)

  fs.writeFile('rss.xml', xml, function (err: any) {
    if (err) throw err
    console.log('Saved!')
  })
}

main()
