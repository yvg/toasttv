import { MpvClient } from '../src/clients/MpvClient'

async function test() {
  console.log('Testing MpvClient...')

  const client = new MpvClient({
    host: '/tmp/mpv-socket', // Socket path
    port: 0, // Unused
    reconnectDelayMs: 1000,
    maxReconnectAttempts: 3,
  })

  try {
    console.log('Connecting...')
    await client.connect()
    console.log('Connected!')

    console.log('Status:', await client.getStatus())

    console.log('Playing dummy file...')
    // Use a known existing file or http stream
    // Using a sample Big Buck Bunny clip or similar if available, or just a fail check
    await client.play(
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
    )

    await Bun.sleep(2000)

    console.log('Status after play:', await client.getStatus())

    // Test Overlay
    console.log('Testing overlay...')
    // Note: using remote URL for overlay might be flaky with ffmpeg movie filter depending on build
    // But let's try. Or use local file.
    // await client.updateLogo({
    //   filePath: 'https://via.placeholder.com/150',
    //   opacity: 0.5,
    //   position: 0,
    //   x: 50,
    //   y: 50
    // })
    // await Bun.sleep(2000)

    console.log('Pausing...')
    await client.pause()
    await Bun.sleep(1000)
    console.log('Status after pause:', await client.getStatus())

    console.log('Disconnecting...')
    await client.disconnect()
    console.log('Done.')
  } catch (e) {
    console.error('Test failed:', e)
  }
}

test()
