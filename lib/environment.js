const ENV_VARS = {
  CHAIN_ID: [process.env.REACT_APP_CHAIN_ID, '4'],
  COMMIT_SHA: [process.env.COMMIT_SHA, ''],
  BUILD: [process.env.BUILD, ''],
  NODE_ENV: [process.env.NODE_ENV, 'development'],

  SITE_DESCRIPTION: [process.env.SITE_DESCRIPTION, `TEC's Augmented Bonding Curve`],
  SITE_TITLE: [process.env.SITE_DESCRIPTION, `TEC's Augmented Bonding Curve`],
  SITE_URL: [process.env.SITE_URL, 'https://convert.tecommons.org/'],
}

function environment(name) {
  const envVar = ENV_VARS[name]
  if (!envVar) {
    return null
  }
  return envVar[0] === undefined ? envVar[1] : envVar[0].trim()
}

function fullEnvironment() {
  return Object.fromEntries(
    Object.keys(ENV_VARS).map(key => ['REACT_APP_' + key, environment(key)])
  )
}
// Important: use CJS in this file so it can get imported by next.config.js.
module.exports = environment
module.exports.fullEnvironment = fullEnvironment
