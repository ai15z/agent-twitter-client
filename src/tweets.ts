import { addApiFeatures, requestApi } from './api';
import { TwitterAuth, Headers as AuthHeaders } from './auth';
import { getUserIdByScreenName } from './profile';
import { QueryTweetsResponse } from './timeline-v1';
import {
  parseTimelineTweetsV2,
  TimelineV2,
  TimelineEntryItemContentRaw,
  parseTimelineEntryItemContentRaw,
  ThreadedConversation,
  parseThreadedConversation,
} from './timeline-v2';
import { getTweetTimeline } from './timeline-async';
import { apiRequestFactory } from './api-data';
import { ListTimeline, parseListTimelineTweets } from './timeline-list';
import { updateCookieJar } from './requests';

export interface Mention {
  id: string;
  username?: string;
  name?: string;
}

export interface Photo {
  id: string;
  url: string;
  alt_text: string | undefined;
}

export interface Video {
  id: string;
  preview: string;
  url?: string;
}

export interface PlaceRaw {
  id?: string;
  place_type?: string;
  name?: string;
  full_name?: string;
  country_code?: string;
  country?: string;
  bounding_box?: {
    type?: string;
    coordinates?: number[][][];
  };
}

/**
 * A parsed Tweet object.
 */
export interface Tweet {
  bookmarkCount?: number;
  conversationId?: string;
  hashtags: string[];
  html?: string;
  id?: string;
  inReplyToStatus?: Tweet;
  inReplyToStatusId?: string;
  isQuoted?: boolean;
  isPin?: boolean;
  isReply?: boolean;
  isRetweet?: boolean;
  isSelfThread?: boolean;
  likes?: number;
  name?: string;
  mentions: Mention[];
  permanentUrl?: string;
  photos: Photo[];
  place?: PlaceRaw;
  quotedStatus?: Tweet;
  quotedStatusId?: string;
  replies?: number;
  retweets?: number;
  retweetedStatus?: Tweet;
  retweetedStatusId?: string;
  text?: string;
  thread: Tweet[];
  timeParsed?: Date;
  timestamp?: number;
  urls: string[];
  userId?: string;
  username?: string;
  videos: Video[];
  views?: number;
  sensitiveContent?: boolean;
}

export type TweetQuery =
  | Partial<Tweet>
  | ((tweet: Tweet) => boolean | Promise<boolean>);

export const features = addApiFeatures({
  interactive_text_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_text_conversations_enabled: false,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
    false,
  vibe_api_enabled: false,
});

export async function fetchTweets(
  userId: string,
  maxTweets: number,
  cursor: string | undefined,
  auth: TwitterAuth,
): Promise<QueryTweetsResponse> {
  if (maxTweets > 200) {
    maxTweets = 200;
  }

  const userTweetsRequest = apiRequestFactory.createUserTweetsRequest();
  userTweetsRequest.variables.userId = userId;
  userTweetsRequest.variables.count = maxTweets;
  userTweetsRequest.variables.includePromotedContent = false; // true on the website

  if (cursor != null && cursor != '') {
    userTweetsRequest.variables['cursor'] = cursor;
  }

  const res = await requestApi<TimelineV2>(
    userTweetsRequest.toRequestUrl(),
    auth,
  );

  if (!res.success) {
    throw res.err;
  }

  return parseTimelineTweetsV2(res.value);
}

export async function fetchTweetsAndReplies(
  userId: string,
  maxTweets: number,
  cursor: string | undefined,
  auth: TwitterAuth,
): Promise<QueryTweetsResponse> {
  if (maxTweets > 40) {
    maxTweets = 40;
  }

  const userTweetsRequest =
    apiRequestFactory.createUserTweetsAndRepliesRequest();
  userTweetsRequest.variables.userId = userId;
  userTweetsRequest.variables.count = maxTweets;
  userTweetsRequest.variables.includePromotedContent = false; // true on the website

  if (cursor != null && cursor != '') {
    userTweetsRequest.variables['cursor'] = cursor;
  }

  const res = await requestApi<TimelineV2>(
    userTweetsRequest.toRequestUrl(),
    auth,
  );

  if (!res.success) {
    throw res.err;
  }

  return parseTimelineTweetsV2(res.value);
}

export async function createCreateTweetRequest(
  variables: {
    tweet_text: string;
    dark_request: boolean;
    media?: {
      media_entities: { media_id: string }[];
      possibly_sensitive: boolean;
    };
    reply?: {
      in_reply_to_tweet_id: string;
      exclude_reply_user_ids: string[];
    };
  },
  auth: TwitterAuth
): Promise<Response> {
  const features = {
    // ... existing features ...
  };

  const params = new URLSearchParams();
  params.set('variables', JSON.stringify(variables));
  params.set('features', JSON.stringify(features));

  const headers = new AuthHeaders({
    'content-type': 'application/json',
  });

  await auth.installTo(headers, 'https://twitter.com/i/api/graphql/your-endpoint/CreateTweet');

  return await auth.fetch(
    'https://twitter.com/i/api/graphql/your-endpoint/CreateTweet',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        variables,
        features,
      }),
    }
  );
}

export async function fetchListTweets(
  listId: string,
  maxTweets: number,
  cursor: string | undefined,
  auth: TwitterAuth,
): Promise<QueryTweetsResponse> {
  if (maxTweets > 200) {
    maxTweets = 200;
  }

  const listTweetsRequest = apiRequestFactory.createListTweetsRequest();
  listTweetsRequest.variables.listId = listId;
  listTweetsRequest.variables.count = maxTweets;

  if (cursor != null && cursor != '') {
    listTweetsRequest.variables['cursor'] = cursor;
  }

  const res = await requestApi<ListTimeline>(
    listTweetsRequest.toRequestUrl(),
    auth,
  );

  if (!res.success) {
    throw res.err;
  }

  return parseListTimelineTweets(res.value);
}

export function getTweets(
  user: string,
  maxTweets: number,
  auth: TwitterAuth,
): AsyncGenerator<Tweet, void> {
  return getTweetTimeline(user, maxTweets, async (q, mt, c) => {
    const userIdRes = await getUserIdByScreenName(q, auth);

    if (!userIdRes.success) {
      throw userIdRes.err;
    }

    const { value: userId } = userIdRes;

    return fetchTweets(userId, mt, c, auth);
  });
}

export function getTweetsByUserId(
  userId: string,
  maxTweets: number,
  auth: TwitterAuth,
): AsyncGenerator<Tweet, void> {
  return getTweetTimeline(userId, maxTweets, (q, mt, c) => {
    return fetchTweets(q, mt, c, auth);
  });
}

export function getTweetsAndReplies(
  user: string,
  maxTweets: number,
  auth: TwitterAuth,
): AsyncGenerator<Tweet, void> {
  return getTweetTimeline(user, maxTweets, async (q, mt, c) => {
    const userIdRes = await getUserIdByScreenName(q, auth);

    if (!userIdRes.success) {
      throw userIdRes.err;
    }

    const { value: userId } = userIdRes;

    return fetchTweetsAndReplies(userId, mt, c, auth);
  });
}

export function getTweetsAndRepliesByUserId(
  userId: string,
  maxTweets: number,
  auth: TwitterAuth,
): AsyncGenerator<Tweet, void> {
  return getTweetTimeline(userId, maxTweets, (q, mt, c) => {
    return fetchTweetsAndReplies(q, mt, c, auth);
  });
}

export async function fetchLikedTweets(
  userId: string,
  maxTweets: number,
  cursor: string | undefined,
  auth: TwitterAuth,
): Promise<QueryTweetsResponse> {
  if (!auth.isLoggedIn()) {
    throw new Error('Scraper is not logged-in for fetching liked tweets.');
  }

  if (maxTweets > 200) {
    maxTweets = 200;
  }

  const userTweetsRequest = apiRequestFactory.createUserLikedTweetsRequest();
  userTweetsRequest.variables.userId = userId;
  userTweetsRequest.variables.count = maxTweets;
  userTweetsRequest.variables.includePromotedContent = false; // true on the website

  if (cursor != null && cursor != '') {
    userTweetsRequest.variables['cursor'] = cursor;
  }

  const res = await requestApi<TimelineV2>(
    userTweetsRequest.toRequestUrl(),
    auth,
  );

  if (!res.success) {
    throw res.err;
  }

  return parseTimelineTweetsV2(res.value);
}

export async function getTweetWhere(
  tweets: AsyncIterable<Tweet>,
  query: TweetQuery,
): Promise<Tweet | null> {
  const isCallback = typeof query === 'function';

  for await (const tweet of tweets) {
    const matches = isCallback
      ? await query(tweet)
      : checkTweetMatches(tweet, query);

    if (matches) {
      return tweet;
    }
  }

  return null;
}

export async function getTweetsWhere(
  tweets: AsyncIterable<Tweet>,
  query: TweetQuery,
): Promise<Tweet[]> {
  const isCallback = typeof query === 'function';
  const filtered = [];

  for await (const tweet of tweets) {
    const matches = isCallback ? query(tweet) : checkTweetMatches(tweet, query);

    if (!matches) continue;
    filtered.push(tweet);
  }

  return filtered;
}

function checkTweetMatches(tweet: Tweet, options: Partial<Tweet>): boolean {
  return Object.keys(options).every((k) => {
    const key = k as keyof Tweet;
    return tweet[key] === options[key];
  });
}

export async function getLatestTweet(
  user: string,
  includeRetweets: boolean,
  max: number,
  auth: TwitterAuth,
): Promise<Tweet | null | void> {
  const timeline = getTweets(user, max, auth);

  // No point looping if max is 1, just use first entry.
  return max === 1
    ? (await timeline.next()).value
    : await getTweetWhere(timeline, { isRetweet: includeRetweets });
}

export interface TweetResultByRestId {
  data?: TimelineEntryItemContentRaw;
}

export async function getTweet(
  id: string,
  auth: TwitterAuth,
): Promise<Tweet | null> {
  const tweetDetailRequest = apiRequestFactory.createTweetDetailRequest();
  tweetDetailRequest.variables.focalTweetId = id;

  const res = await requestApi<ThreadedConversation>(
    tweetDetailRequest.toRequestUrl(),
    auth,
  );

  if (!res.success) {
    throw res.err;
  }

  if (!res.value) {
    return null;
  }

  const tweets = parseThreadedConversation(res.value);
  return tweets.find((tweet) => tweet.id === id) ?? null;
}

export async function getTweetAnonymous(
  id: string,
  auth: TwitterAuth,
): Promise<Tweet | null> {
  const tweetResultByRestIdRequest =
    apiRequestFactory.createTweetResultByRestIdRequest();
  tweetResultByRestIdRequest.variables.tweetId = id;

  const res = await requestApi<TweetResultByRestId>(
    tweetResultByRestIdRequest.toRequestUrl(),
    auth,
  );

  if (!res.success) {
    throw res.err;
  }

  if (!res.value.data) {
    return null;
  }

  return parseTimelineEntryItemContentRaw(res.value.data, id);
}

export async function createRetweetRequest(
  tweetId: string,
  auth: TwitterAuth
): Promise<Response> {
  const headers = new AuthHeaders({
    'content-type': 'application/json',
  });

  await auth.installTo(headers, 'https://twitter.com/i/api/graphql/ojPdsZsimiJrUGLR1sjUtA/CreateRetweet');

  return await auth.fetch(
    'https://twitter.com/i/api/graphql/ojPdsZsimiJrUGLR1sjUtA/CreateRetweet',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        variables: {
          tweet_id: tweetId,
          dark_request: false
        },
        queryId: "ojPdsZsimiJrUGLR1sjUtA"
      }),
    }
  );
}

export async function createQuoteTweetRequest(
  tweetId: string,
  text: string,
  mediaIds: string[] | undefined,
  auth: TwitterAuth
): Promise<Response> {
  const attachmentUrl = `https://twitter.com/twitter/status/${tweetId}`;

  const variables = {
    tweet_text: text,
    dark_request: false,
    attachment_url: attachmentUrl,
    media: mediaIds ? {
      media_entities: mediaIds.map(id => ({ media_id: id })),
      possibly_sensitive: false
    } : undefined,
    semantic_annotation_ids: []
  };

  const headers = new AuthHeaders({
    'content-type': 'application/json',
    'Referer': `https://twitter.com/twitter/status/${tweetId}`
  });

  await auth.installTo(headers, 'https://twitter.com/i/api/graphql/SoVnbfCycZ7fERGCwpZkYA/CreateTweet');

  return await auth.fetch(
    'https://twitter.com/i/api/graphql/SoVnbfCycZ7fERGCwpZkYA/CreateTweet',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        variables,
        features: {
          tweetypie_unmention_optimization_enabled: true,
          responsive_web_edit_tweet_api_enabled: true,
          graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
          view_counts_everywhere_api_enabled: true,
          longform_notetweets_consumption_enabled: true,
          responsive_web_twitter_article_tweet_consumption_enabled: false,
          tweet_awards_web_tipping_enabled: false,
          longform_notetweets_rich_text_read_enabled: true,
          longform_notetweets_inline_media_enabled: true,
          responsive_web_graphql_exclude_directive_enabled: true,
          verified_phone_label_enabled: false,
          freedom_of_speech_not_reach_fetch_enabled: true,
          standardized_nudges_misinfo: true,
          tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
          responsive_web_graphql_timeline_navigation_enabled: true,
          responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
          responsive_web_enhance_cards_enabled: false,
          responsive_web_media_download_video_enabled: false
        },
        queryId: "SoVnbfCycZ7fERGCwpZkYA"
      }),
    }
  );
}

export interface MediaUploadResponse {
  media_id_string?: string;
  processing_info?: {
    state: string;
    check_after_secs?: number;
  };
}
