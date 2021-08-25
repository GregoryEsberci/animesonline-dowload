const axios = require('axios').default
const { JSDOM } = require("jsdom");
const { execFileSync, execFile } = require("child_process");
const path = require('path')
const os = require('os')
// TODO: Add argument to select episode/seasons to start to download


const EPISODES_LIST_URL = process.argv[2];

const getAnimeName = () => {
  const pathname = new URL(EPISODES_LIST_URL)
    .pathname
    .split('/')
    .filter(Boolean);

  return pathname[pathname.length - 1]
}

const PATH_TO_SAVE = path.join(
  os.homedir(),
  `/Downloads/animes`,
  getAnimeName()
);

// Source: https://ricardometring.com/javascript-replace-special-characters
/**
 * @param {string} str 
 * @returns {string}
 */
const replaceSpecialChars = (str) => (
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/([^\w]+|\s+)/g, '-')
    .replace(/\-\-+/g, '-')
    .replace(/(^-+|-+$)/, '')
)

const fetchDocument = async (url) => new JSDOM((await axios.get(url)).data).window.document


const promiseFromChildProcess = (child) => (
  new Promise(function(resolve, reject) {
    child.addListener("error", reject);
    child.addListener("exit", resolve);
  })
)

const getEpisodesList = async () => {
  console.log('Downloading episodes list')
  const document = await fetchDocument(EPISODES_LIST_URL)
  const result = []

  document
    .querySelectorAll('#seasons ul.episodios li .episodiotitle a')
    .forEach((episodeTitle) => {
      result.push({
        title: replaceSpecialChars(episodeTitle.textContent).toLowerCase(),
        url: episodeTitle.href,
      })
    })

  console.log('Episodes', result.length)

  return result
}

const getDownloadURL = async (episode) => {
  console.log('getting download url to:', episode.title)

  const document = await fetchDocument(episode.url)
  const postId = document.querySelector('#report-video-button-field > input[name="postid"]').value

  const downloadPage = await fetchDocument(`https://animesonline.org/download/?id=${postId}`);

  return downloadPage.querySelector('ul.item li a').href;
}

// TODO: Slow download: ex: https://animesonline.org/episodio/boku-no-hero-academia-episodio-1/
const downloadFile = async (url, fileName) => {
  console.log('downloading', fileName)
  const arguments = [
    url,
    '-o', `${path.join(PATH_TO_SAVE, fileName)}.%(ext)s`,
    '--no-warnings'
  ]

  const filePath = execFileSync(
    'youtube-dl',
    [...arguments, '--get-filename'],
    { encoding: 'utf-8' }
  ).replace('\n', '')

  const downloadChild = execFile('youtube-dl', arguments, { encoding: 'utf-8' })

  downloadChild.stdout.on('data', (chunk) => process.stdout.write(chunk))

  await promiseFromChildProcess(downloadChild);

  return filePath;
}

(async () => {
  const episodes = await getEpisodesList()
  const errors = []

  for await (const episode of episodes) {
    try {
      const downloadURL = await getDownloadURL(episode);

      await downloadFile(downloadURL, episode.title)
    } catch (error) {
      errors.push(episode)
      console.log('###### download fail ####', episode.title)
      console.error(error)
    }
  }

  console.log('download end')
  if (errors.length) console.log('errors', errors.map((error) => error.title).join(', '))
})()