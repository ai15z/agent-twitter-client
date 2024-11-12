import { Scraper } from './src/scraper';
import { Tweet } from './src/tweets';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import dotenv from 'dotenv';  
import fetch from 'node-fetch';

// Load environment variables from .env file
dotenv.config();

// Create a new Scraper instance
const scraper = new Scraper();

// Create readline interface for CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

// Function to log in and save cookies
async function loginAndSaveCookies() {
  try {
    // Log in using credentials from environment variables
    await scraper.login(
      process.env.TWITTER_USERNAME!,
      process.env.TWITTER_PASSWORD!,
      process.env.TWITTER_EMAIL
    );

    // Retrieve the current session cookies
    const cookies = await scraper.getCookies();

    // Save the cookies to a JSON file for future sessions
    fs.writeFileSync(
      path.resolve(__dirname, 'cookies.json'),
      JSON.stringify(cookies)
    );

    console.log('Logged in and cookies saved.');
  } catch (error) {
    console.error('Error during login:', error);
  }
}

// Function to load cookies from the JSON file
async function loadCookies() {
  try {
    // Read cookies from the file system
    const cookiesData = fs.readFileSync(
      path.resolve(__dirname, 'cookies.json'),
      'utf8'
    );
    const cookiesArray = JSON.parse(cookiesData);

    // Map cookies to the correct format (strings)
    const cookieStrings = cookiesArray.map((cookie: any) => {
      return `${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}; ${
        cookie.secure ? 'Secure' : ''
      }; ${cookie.httpOnly ? 'HttpOnly' : ''}; SameSite=${
        cookie.sameSite || 'Lax'
      }`;
    });

    // Set the cookies for the current session
    await scraper.setCookies(cookieStrings);

    console.log('Cookies loaded from file.');
  } catch (error) {
    console.error('Error loading cookies:', error);
  }
}

// Function to ensure the scraper is authenticated
async function ensureAuthenticated() {
  // Check if cookies.json exists to decide whether to log in or load cookies
  if (fs.existsSync(path.resolve(__dirname, 'cookies.json'))) {
    // Load cookies if the file exists
    await loadCookies();

    // Inform the user that they are already logged in
    console.log('You are already logged in. No need to log in again.');
  } else {
    // Log in and save cookies if no cookie file is found
    await loginAndSaveCookies();
  }
}

// Function to send a tweet and retrieve the tweet ID
async function sendTweet(
  text: string,
  replyToTweetId?: string
): Promise<string | null> {
  try {
    // Send the tweet and get the response
    const response = await scraper.sendTweet(text, replyToTweetId);

    // Parse the response to extract the tweet ID
    const responseData = await response.json();
    const tweetId =
      responseData?.data?.create_tweet?.tweet_results?.result?.rest_id;

    if (tweetId) {
      console.log(`Tweet sent: "${text}" (ID: ${tweetId})`);
      return tweetId;
    } else {
      console.error('Tweet ID not found in response.');
      return null;
    }
  } catch (error) {
    console.error('Error sending tweet:', error);
    return null;
  }
}

// Function to get replies to a specific tweet
async function getRepliesToTweet(tweetId: string): Promise<Tweet[]> {
  const replies: Tweet[] = [];
  try {
    // Construct the search query to find replies
    const query = `to:${process.env.TWITTER_USERNAME} conversation_id:${tweetId}`;
    const maxReplies = 100; // Maximum number of replies to fetch
    const searchMode = 1; // SearchMode.Latest

    // Fetch replies matching the query
    for await (const tweet of scraper.searchTweets(query, maxReplies, searchMode)) {
      // Check if the tweet is a direct reply to the original tweet
      if (tweet.inReplyToStatusId === tweetId) {
        replies.push(tweet);
      }
    }

    console.log(`Found ${replies.length} replies to tweet ID ${tweetId}.`);
  } catch (error) {
    console.error('Error fetching replies:', error);
  }
  return replies;
}

// Function to reply to a specific tweet
async function replyToTweet(tweetId: string, text: string) {
  try {
    // Send a reply to the specified tweet ID
    const replyId = await sendTweet(text, tweetId);

    if (replyId) {
      console.log(`Reply sent (ID: ${replyId}).`);
    }
  } catch (error) {
    console.error('Error sending reply:', error);
  }
}

// Function to get photos from a specific tweet
async function getPhotosFromTweet(tweetId: string) {
  try {
    // Fetch the tweet by its ID
    const tweet = await scraper.getTweet(tweetId);

    // Check if the tweet exists and contains photos
    if (tweet && tweet.photos.length > 0) {
      console.log(`Found ${tweet.photos.length} photo(s) in tweet ID ${tweetId}:`);
      // Iterate over each photo and display its URL
      tweet.photos.forEach((photo, index) => {
        console.log(`Photo ${index + 1}: ${photo.url}`);
      });
    } else {
      console.log('No photos found in the specified tweet.');
    }
  } catch (error) {
    console.error('Error fetching tweet:', error);
  }
}

// Function to fetch media from URL
async function fetchMediaFromUrl(url: string): Promise<Buffer> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error('Error fetching media from URL:', error);
    throw error;
  }
}

// Function to send a tweet with media attachments
async function sendTweetWithMedia(
  text: string,
  mediaUrls: string[], // Now only accepts URLs
  replyToTweetId?: string
): Promise<string | null> {
  try {
    const mediaIds: string[] = [];
    
    for (const mediaUrl of mediaUrls) {
      if (!mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://')) {
        console.error('Invalid media URL:', mediaUrl);
        continue;
      }

      try {
        // Fetch media from URL
        const mediaData = await fetchMediaFromUrl(mediaUrl);
        
        // Determine media type from URL
        const mediaType = mediaUrl.toLowerCase().endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';
        
        // Upload the media
        const uploadResponse = await scraper.uploadMedia(mediaData, mediaType);
        
        if (uploadResponse?.media_id_string) {
          mediaIds.push(uploadResponse.media_id_string);
        } else {
          console.error('Failed to upload media:', mediaUrl);
        }
      } catch (error) {
        console.error(`Failed to process media URL ${mediaUrl}:`, error);
      }
    }

    if (mediaIds.length === 0) {
      console.error('No media was successfully uploaded');
      return null;
    }

    // Send the tweet with the media IDs
    const response = await scraper.sendTweet(text, replyToTweetId, mediaIds);
    const responseData = await response.json();
    const tweetId = responseData?.data?.create_tweet?.tweet_results?.result?.rest_id;

    if (tweetId) {
      console.log(`Tweet with media sent: "${text}" (ID: ${tweetId})`);
      return tweetId;
    } else {
      console.error('Tweet ID not found in response.');
      return null;
    }
  } catch (error) {
    console.error('Error sending tweet with media:', error);
    return null;
  }
}

// Function to parse command line while preserving quoted strings
function parseCommandLine(commandLine: string): string[] {
  const args: string[] = [];
  let currentArg = '';
  let inQuotes = false;

  for (let i = 0; i < commandLine.length; i++) {
    const char = commandLine[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ' ' && !inQuotes) {
      if (currentArg) {
        args.push(currentArg);
        currentArg = '';
      }
    } else {
      currentArg += char;
    }
  }

  if (currentArg) {
    args.push(currentArg);
  }

  return args;
}

// Function to execute commands
async function executeCommand(commandLine: string) {
  const args = parseCommandLine(commandLine);
  const command = args.shift(); // Remove and get the first element as command

  if (!command) return;

  switch (command) {
    case 'login':
      await loginAndSaveCookies();
      break;

    case 'send-tweet':
      await ensureAuthenticated();
      const tweetText = args.join(' ');
      if (!tweetText) {
        console.log('Please provide text for the tweet.');
      } else {
        await sendTweet(tweetText);
      }
      break;

    case 'get-tweets':
      await ensureAuthenticated();
      const username = args[0];
      if (!username) {
        console.log('Please provide a username.');
      } else {
        try {
          const maxTweets = 20; // Maximum number of tweets to fetch
          const tweets: Tweet[] = [];
          for await (const tweet of scraper.getTweets(username, maxTweets)) {
            tweets.push(tweet);
          }
          console.log(`Fetched ${tweets.length} tweets from @${username}:`);
          tweets.forEach((tweet) => {
            console.log(`- [${tweet.id}] ${tweet.text}`);
          });
        } catch (error) {
          console.error('Error fetching tweets:', error);
        }
      }
      break;

    case 'get-replies': {
      await ensureAuthenticated();
      const tweetId = args[0];
      if (!tweetId) {
        console.log('Please provide a tweet ID.');
      } else {
        const replies = await getRepliesToTweet(tweetId);
        console.log(`Found ${replies.length} replies:`);
        replies.forEach((reply) => {
          console.log(`- @${reply.username}: ${reply.text}`);
        });
      }
      break;
    }

    case 'reply-to-tweet':
      await ensureAuthenticated();
      const replyTweetId = args[0];
      const replyText = args.slice(1).join(' ');
      if (!replyTweetId || !replyText) {
        console.log('Please provide a tweet ID and text to reply.');
      } else {
        await replyToTweet(replyTweetId, replyText);
      }
      break;

    case 'get-mentions':
      await ensureAuthenticated();
      try {
        const maxTweets = 20; // Maximum number of mentions to fetch
        const mentions: Tweet[] = [];
        const query = `@${process.env.TWITTER_USERNAME}`;
        const searchMode = 1; // SearchMode.Latest

        // Fetch recent mentions
        for await (const tweet of scraper.searchTweets(query, maxTweets, searchMode)) {
          // Exclude your own tweets
          if (tweet.username !== process.env.TWITTER_USERNAME) {
            mentions.push(tweet);
          }
        }
        console.log(`Found ${mentions.length} mentions:`);
        mentions.forEach((tweet) => {
          console.log(`- [${tweet.id}] @${tweet.username}: ${tweet.text}`);
        });

        // Fetch replies to each mention
        for (const mention of mentions) {
          // Get replies to the mention
          const replies = await getRepliesToTweet(mention.id!);
          console.log(`Replies to mention [${mention.id}] by @${mention.username}:`);
          replies.forEach((reply) => {
            console.log(`- [${reply.id}] @${reply.username}: ${reply.text}`);
          });
        }
      } catch (error) {
        console.error('Error fetching mentions:', error);
      }
      break;

    case 'help':
      console.log('Available commands:');
      console.log('  login                     - Login to Twitter and save cookies');
      console.log('  send-tweet <text>         - Send a tweet with the given text');
      console.log('  get-tweets <username>     - Get recent tweets from the specified user');
      console.log('  get-replies <tweetId>     - Get replies to the specified tweet ID');
      console.log('  reply-to-tweet <tweetId> <text> - Reply to a tweet with the specified text');
      console.log('  get-mentions              - Get recent mentions of your account');
      console.log('  like-tweet <tweetId>      - Like a specific tweet');
      console.log('  follow-user <username>     - Follow a user by their username (without @ symbol)');
      console.log('  send-tweet-with-media <text> <mediaPath> - Send a tweet with media');
      console.log('  exit                      - Exit the application');
      console.log('  help                      - Show this help message');
      console.log('  retweet <tweetId>           - Retweet a specific tweet');
      console.log('  quote-tweet <tweetId> <text> - Quote tweet with text');
      console.log('  quote-tweet-with-media <tweetId> <text> <mediaPath...> - Quote tweet with text and media');
      console.log('  is-following <username>   - Check if you are following a user');
      break;

    case 'exit':
      console.log('Exiting...');
      rl.close();
      process.exit(0);
      break;

    case 'get-photos': {
      await ensureAuthenticated();
      const tweetId = args[0];
      if (!tweetId) {
        console.log('Please provide a tweet ID.');
      } else {
        await getPhotosFromTweet(tweetId);
      }
      break;
    }

    case 'send-tweet-with-media': {
      await ensureAuthenticated();
      const text = args[0];
      const mediaUrls = args.slice(1);
      
      if (!text || mediaUrls.length === 0) {
        console.log('Please provide text and at least one media URL.');
      } else {
        await sendTweetWithMedia(text, mediaUrls);
      }
      break;
    }

    case 'like-tweet': {
      await ensureAuthenticated();
      const tweetId = args[0];
      if (!tweetId) {
        console.log('Please provide a tweet ID.');
      } else {
        await scraper.likeTweet(tweetId);
      }
      break;
    }

    case 'follow-user': {
      await ensureAuthenticated();
      const username = args[0];
      if (!username) {
        console.log('Please provide a username (without @ symbol).');
      } else {
        try {
          await scraper.followUser(username);
          console.log(`Successfully followed @${username}`);
        } catch (error) {
          console.error('Error following user:', error);
        }
      }
      break;
    }

    case 'retweet': {
      await ensureAuthenticated();
      const tweetId = args[0];
      if (!tweetId) {
        console.log('Please provide a tweet ID to retweet.');
      } else {
        try {
          await scraper.retweet(tweetId);
          console.log(`Successfully retweeted tweet ${tweetId}`);
        } catch (error) {
          console.error('Error retweeting:', error);
        }
      }
      break;
    }

    case 'quote-tweet': {
      await ensureAuthenticated();
      const tweetId = args[0];
      const text = args.slice(1).join(' ');
      if (!tweetId || !text) {
        console.log('Please provide a tweet ID and text for the quote tweet.');
      } else {
        try {
          const response = await scraper.quoteTweet(tweetId, text);
          const responseData = await response.json();
          
          // Check if the tweet was actually created
          if (responseData?.data?.create_tweet?.tweet_results?.result?.rest_id) {
            const newTweetId = responseData.data.create_tweet.tweet_results.result.rest_id;
            console.log(`Successfully quote tweeted! New tweet ID: ${newTweetId}`);
            console.log(`Tweet URL: https://twitter.com/i/status/${newTweetId}`);
          } else {
            console.error('Failed to create quote tweet. Response:', responseData);
            throw new Error('Quote tweet creation failed - no tweet ID in response');
          }
        } catch (error) {
          console.error('Error quote tweeting:', error);
          if (error instanceof Error) {
            console.error('Error details:', error.message);
          }
        }
      }
      break;
    }

    case 'quote-tweet-with-media': {
      await ensureAuthenticated();
      const tweetId = args[0];
      const text = args[1];
      const mediaUrls = args.slice(2);
      if (!tweetId || !text || mediaUrls.length === 0) {
        console.log('Please provide: tweet ID, text, and at least one media URL.');
      } else {
        try {
          const mediaIds: string[] = [];
          
          for (const mediaUrl of mediaUrls) {
            if (!mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://')) {
              console.error('Invalid media URL:', mediaUrl);
              continue;
            }

            try {
              // Fetch media from URL
              const mediaData = await fetchMediaFromUrl(mediaUrl);
              
              // Determine media type
              const mediaType = mediaUrl.toLowerCase().endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';
              
              const uploadResponse = await scraper.uploadMedia(mediaData, mediaType);
              if (uploadResponse?.media_id_string) {
                mediaIds.push(uploadResponse.media_id_string);
              } else {
                console.error('Failed to upload media:', mediaUrl);
              }
            } catch (error) {
              console.error(`Failed to process media URL ${mediaUrl}:`, error);
            }
          }

          if (mediaIds.length === 0) {
            console.error('No media was successfully uploaded');
            return;
          }
          
          // Create the quote tweet with media
          const response = await scraper.quoteTweet(tweetId, text, mediaIds);
          const responseData = await response.json();
          
          if (responseData?.data?.create_tweet?.tweet_results?.result?.rest_id) {
            const newTweetId = responseData.data.create_tweet.tweet_results.result.rest_id;
            console.log(`Successfully quote tweeted with media! New tweet ID: ${newTweetId}`);
            console.log(`Tweet URL: https://twitter.com/i/status/${newTweetId}`);
          } else {
            console.error('Failed to create quote tweet with media. Response:', responseData);
            throw new Error('Quote tweet creation failed - no tweet ID in response');
          }
        } catch (error) {
          console.error('Error quote tweeting with media:', error);
          if (error instanceof Error) {
            console.error('Error details:', error.message);
          }
        }
      }
      break;
    }

    case 'is-following': {
      await ensureAuthenticated();
      const username = args[0];
      if (!username) {
        console.log('Please provide a username (without @ symbol).');
      } else {
        try {
          const isFollowing = await scraper.isFollowing(username);
          console.log(`You are ${isFollowing ? '' : 'not '}following @${username}`);
        } catch (error) {
          console.error('Error checking following status:', error);
        }
      }
      break;
    }

    default:
      console.log(`Unknown command: ${command}. Type 'help' to see available commands.`);
      break;
  }
}

// Main function to start the CLI
(async () => {
  console.log('Welcome to the Twitter CLI Interface!');
  console.log("Type 'help' to see available commands.");
  rl.prompt();

  rl.on('line', async (line) => {
    await executeCommand(line);
    rl.prompt();
  }).on('close', () => {
    console.log('Goodbye!');
    process.exit(0);
  });
})();
