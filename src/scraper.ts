import { Cookie } from 'tough-cookie';
import {
  bearerToken,
  FetchTransformOptions,
  requestApi,
  RequestApiResult,
} from './api';
import { TwitterAuth, TwitterAuthOptions, TwitterGuestAuth } from './auth';
import { TwitterUserAuth } from './auth-user';
import {
  getProfile,
  getUserIdByScreenName,
  getScreenNameByUserId,
  Profile,
} from './profile';
import {
  fetchSearchProfiles,
  fetchSearchTweets,
  SearchMode,
  searchProfiles,
  searchTweets,
} from './search';
import {
  fetchProfileFollowing,
  fetchProfileFollowers,
  getFollowing,
  getFollowers,
} from './relationships';
import { QueryProfilesResponse, QueryTweetsResponse } from './timeline-v1';
import { getTrends } from './trends';
import {
  Tweet,
  getTweetAnonymous,
  getTweets,
  getLatestTweet,
  getTweetWhere,
  getTweetsWhere,
  getTweetsByUserId,
  TweetQuery,
  getTweet,
  fetchListTweets,
  getTweetsAndRepliesByUserId,
  getTweetsAndReplies,
  createCreateTweetRequest,
} from './tweets';
import { parseTimelineTweetsV2, TimelineV2 } from './timeline-v2';
import { fetchHomeTimeline, HomeTimelineResponse } from './timeline-home';

const twUrl = 'https://twitter.com';
const UserTweetsUrl =
  'https://twitter.com/i/api/graphql/E3opETHurmVJflFsUBVuUQ/UserTweets';

export interface ScraperOptions {
  /**
   * An alternative fetch function to use instead of the default fetch function. This may be useful
   * in nonstandard runtime environments, such as edge workers.
   */
  fetch: typeof fetch;

  /**
   * Additional options that control how requests and responses are processed. This can be used to
   * proxy requests through other hosts, for example.
   */
  transform: Partial<FetchTransformOptions>;
}

// Move interface outside the class
interface MediaUploadResponse {
  media_id_string?: string;
  processing_info?: {
    state: string;
    check_after_secs?: number;
  };
}

// Add this interface near the top of the file with other interfaces
interface TweetVariables {
  tweet_text: string;
  dark_request: boolean;
  media?: {
    media_entities: { media_id: string; }[];
    possibly_sensitive: boolean;
  };
  reply?: {
    in_reply_to_tweet_id: string;
    exclude_reply_user_ids: string[];
  };
}

// Add this interface near the top of the file with other interfaces
interface FriendshipResponse {
  relationship: {
    source: {
      following: boolean;
      // Add other properties as needed
    };
  };
}

/**
 * An interface to Twitter's undocumented API.
 * - Reusing Scraper objects is recommended to minimize the time spent authenticating unnecessarily.
 */
export class Scraper {
  private auth!: TwitterAuth;
  private authTrends!: TwitterAuth;
  private token: string;

  /**
   * Creates a new Scraper object.
   * - Scrapers maintain their own guest tokens for Twitter's internal API.
   * - Reusing Scraper objects is recommended to minimize the time spent authenticating unnecessarily.
   */
  constructor(private readonly options?: Partial<ScraperOptions>) {
    this.token = bearerToken;
    this.useGuestAuth();
  }

  /**
   * Initializes auth properties using a guest token.
   * Used when creating a new instance of this class, and when logging out.
   * @internal
   */
  private useGuestAuth() {
    this.auth = new TwitterGuestAuth(this.token, this.getAuthOptions());
    this.authTrends = new TwitterGuestAuth(this.token, this.getAuthOptions());
  }

  /**
   * Fetches a Twitter profile.
   * @param username The Twitter username of the profile to fetch, without an `@` at the beginning.
   * @returns The requested {@link Profile}.
   */
  public async getProfile(username: string): Promise<Profile> {
    const res = await getProfile(username, this.auth);
    return this.handleResponse(res);
  }

  /**
   * Fetches the user ID corresponding to the provided screen name.
   * @param screenName The Twitter screen name of the profile to fetch.
   * @returns The ID of the corresponding account.
   */
  public async getUserIdByScreenName(screenName: string): Promise<string> {
    const res = await getUserIdByScreenName(screenName, this.auth);
    return this.handleResponse(res);
  }

  /**
   *
   * @param userId The user ID of the profile to fetch.
   * @returns The screen name of the corresponding account.
   */
  public async getScreenNameByUserId(userId: string): Promise<string> {
    const response = await getScreenNameByUserId(userId, this.auth);
    return this.handleResponse(response);
  }

  /**
   * Fetches tweets from Twitter.
   * @param query The search query. Any Twitter-compatible query format can be used.
   * @param maxTweets The maximum number of tweets to return.
   * @param includeReplies Whether or not replies should be included in the response.
   * @param searchMode The category filter to apply to the search. Defaults to `Top`.
   * @returns An {@link AsyncGenerator} of tweets matching the provided filters.
   */
  public searchTweets(
    query: string,
    maxTweets: number,
    searchMode: SearchMode = SearchMode.Top,
  ): AsyncGenerator<Tweet, void> {
    return searchTweets(query, maxTweets, searchMode, this.auth);
  }

  /**
   * Fetches profiles from Twitter.
   * @param query The search query. Any Twitter-compatible query format can be used.
   * @param maxProfiles The maximum number of profiles to return.
   * @returns An {@link AsyncGenerator} of tweets matching the provided filter(s).
   */
  public searchProfiles(
    query: string,
    maxProfiles: number,
  ): AsyncGenerator<Profile, void> {
    return searchProfiles(query, maxProfiles, this.auth);
  }

  /**
   * Fetches tweets from Twitter.
   * @param query The search query. Any Twitter-compatible query format can be used.
   * @param maxTweets The maximum number of tweets to return.
   * @param includeReplies Whether or not replies should be included in the response.
   * @param searchMode The category filter to apply to the search. Defaults to `Top`.
   * @param cursor The search cursor, which can be passed into further requests for more results.
   * @returns A page of results, containing a cursor that can be used in further requests.
   */
  public fetchSearchTweets(
    query: string,
    maxTweets: number,
    searchMode: SearchMode,
    cursor?: string,
  ): Promise<QueryTweetsResponse> {
    return fetchSearchTweets(query, maxTweets, searchMode, this.auth, cursor);
  }

  /**
   * Fetches profiles from Twitter.
   * @param query The search query. Any Twitter-compatible query format can be used.
   * @param maxProfiles The maximum number of profiles to return.
   * @param cursor The search cursor, which can be passed into further requests for more results.
   * @returns A page of results, containing a cursor that can be used in further requests.
   */
  public fetchSearchProfiles(
    query: string,
    maxProfiles: number,
    cursor?: string,
  ): Promise<QueryProfilesResponse> {
    return fetchSearchProfiles(query, maxProfiles, this.auth, cursor);
  }

  /**
   * Fetches list tweets from Twitter.
   * @param listId The list id
   * @param maxTweets The maximum number of tweets to return.
   * @param cursor The search cursor, which can be passed into further requests for more results.
   * @returns A page of results, containing a cursor that can be used in further requests.
   */
  public fetchListTweets(
    listId: string,
    maxTweets: number,
    cursor?: string,
  ): Promise<QueryTweetsResponse> {
    return fetchListTweets(listId, maxTweets, cursor, this.auth);
  }

  /**
   * Fetch the profiles a user is following
   * @param userId The user whose following should be returned
   * @param maxProfiles The maximum number of profiles to return.
   * @returns An {@link AsyncGenerator} of following profiles for the provided user.
   */
  public getFollowing(
    userId: string,
    maxProfiles: number,
  ): AsyncGenerator<Profile, void> {
    return getFollowing(userId, maxProfiles, this.auth);
  }

  /**
   * Fetch the profiles that follow a user
   * @param userId The user whose followers should be returned
   * @param maxProfiles The maximum number of profiles to return.
   * @returns An {@link AsyncGenerator} of profiles following the provided user.
   */
  public getFollowers(
    userId: string,
    maxProfiles: number,
  ): AsyncGenerator<Profile, void> {
    return getFollowers(userId, maxProfiles, this.auth);
  }

  /**
   * Fetches following profiles from Twitter.
   * @param userId The user whose following should be returned
   * @param maxProfiles The maximum number of profiles to return.
   * @param cursor The search cursor, which can be passed into further requests for more results.
   * @returns A page of results, containing a cursor that can be used in further requests.
   */
  public fetchProfileFollowing(
    userId: string,
    maxProfiles: number,
    cursor?: string,
  ): Promise<QueryProfilesResponse> {
    return fetchProfileFollowing(userId, maxProfiles, this.auth, cursor);
  }

  /**
   * Fetches profile followers from Twitter.
   * @param userId The user whose following should be returned
   * @param maxProfiles The maximum number of profiles to return.
   * @param cursor The search cursor, which can be passed into further requests for more results.
   * @returns A page of results, containing a cursor that can be used in further requests.
   */
  public fetchProfileFollowers(
    userId: string,
    maxProfiles: number,
    cursor?: string,
  ): Promise<QueryProfilesResponse> {
    return fetchProfileFollowers(userId, maxProfiles, this.auth, cursor);
  }

  /**
   * Fetches the home timeline for the current user.
   * @param count The number of tweets to fetch.
   * @param seenTweetIds An array of tweet IDs that have already been seen.
   * @returns A promise that resolves to the home timeline response.
   */
  public async fetchHomeTimeline(
    count: number,
    seenTweetIds: string[],
  ): Promise<any[]> {
    return await fetchHomeTimeline(count, seenTweetIds, this.auth);
  }

  async getUserTweets(
    userId: string,
    maxTweets = 200,
    cursor?: string,
  ): Promise<{ tweets: Tweet[]; next?: string }> {
    if (maxTweets > 200) {
      maxTweets = 200;
    }

    const variables: Record<string, any> = {
      userId,
      count: maxTweets,
      includePromotedContent: true,
      withQuickPromoteEligibilityTweetFields: true,
      withVoice: true,
      withV2Timeline: true,
    };

    if (cursor) {
      variables['cursor'] = cursor;
    }

    const features = {
      rweb_tipjar_consumption_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      articles_preview_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      creator_subscriptions_quote_tweet_preview_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
        true,
      rweb_video_timestamps_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_enhance_cards_enabled: false,
    };

    const fieldToggles = {
      withArticlePlainText: false,
    };

    const res = await requestApi<TimelineV2>(
      `${UserTweetsUrl}?variables=${encodeURIComponent(
        JSON.stringify(variables),
      )}&features=${encodeURIComponent(
        JSON.stringify(features),
      )}&fieldToggles=${encodeURIComponent(JSON.stringify(fieldToggles))}`,
      this.auth,
    );

    if (!res.success) {
      throw res.err;
    }

    const timelineV2 = parseTimelineTweetsV2(res.value);
    return {
      tweets: timelineV2.tweets,
      next: timelineV2.next,
    };
  }

  async *getUserTweetsIterator(
    userId: string,
    maxTweets = 200,
  ): AsyncGenerator<Tweet, void> {
    let cursor: string | undefined;
    let retrievedTweets = 0;

    while (retrievedTweets < maxTweets) {
      const response = await this.getUserTweets(
        userId,
        maxTweets - retrievedTweets,
        cursor,
      );

      for (const tweet of response.tweets) {
        yield tweet;
        retrievedTweets++;
        if (retrievedTweets >= maxTweets) {
          break;
        }
      }

      cursor = response.next;

      if (!cursor) {
        break;
      }
    }
  }

  /**
   * Fetches the current trends from Twitter.
   * @returns The current list of trends.
   */
  public getTrends(): Promise<string[]> {
    return getTrends(this.authTrends);
  }

  /**
   * Fetches tweets from a Twitter user.
   * @param user The user whose tweets should be returned.
   * @param maxTweets The maximum number of tweets to return. Defaults to `200`.
   * @returns An {@link AsyncGenerator} of tweets from the provided user.
   */
  public getTweets(user: string, maxTweets = 200): AsyncGenerator<Tweet> {
    return getTweets(user, maxTweets, this.auth);
  }

  /**
   * Fetches tweets from a Twitter user using their ID.
   * @param userId The user whose tweets should be returned.
   * @param maxTweets The maximum number of tweets to return. Defaults to `200`.
   * @returns An {@link AsyncGenerator} of tweets from the provided user.
   */
  public getTweetsByUserId(
    userId: string,
    maxTweets = 200,
  ): AsyncGenerator<Tweet, void> {
    return getTweetsByUserId(userId, maxTweets, this.auth);
  }

  /**
   * Send a tweet
   * @param text The text of the tweet
   * @param tweetId The id of the tweet to reply to
   * @returns
   */

  async sendTweet(text: string, replyToTweetId?: string, mediaIds?: string[]): Promise<Response> {
    const variables: TweetVariables = {
      tweet_text: text,
      dark_request: false,
      media: mediaIds ? {
        media_entities: mediaIds.map(id => ({ media_id: id })),
        possibly_sensitive: false
      } : undefined
    };

    if (replyToTweetId) {
      variables.reply = {
        in_reply_to_tweet_id: replyToTweetId,
        exclude_reply_user_ids: []
      };
    }

    // Use GraphQL endpoint for tweet creation
    const response = await requestApi(
      'https://twitter.com/i/api/graphql/SoVnbfCycZ7fERGCwpZkYA/CreateTweet',
      this.auth,
      'POST',
      {
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
            responsive_web_media_download_video_enabled: false,
            creator_subscriptions_tweet_preview_api_enabled: true
          },
          queryId: "SoVnbfCycZ7fERGCwpZkYA"
        }),
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );

    if (!response.success) {
      throw response.err;
    }

    // Create a Response object to maintain compatibility with existing code
    return new Response(JSON.stringify(response.value), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Fetches tweets and replies from a Twitter user.
   * @param user The user whose tweets should be returned.
   * @param maxTweets The maximum number of tweets to return. Defaults to `200`.
   * @returns An {@link AsyncGenerator} of tweets from the provided user.
   */
  public getTweetsAndReplies(
    user: string,
    maxTweets = 200,
  ): AsyncGenerator<Tweet> {
    return getTweetsAndReplies(user, maxTweets, this.auth);
  }

  /**
   * Fetches tweets and replies from a Twitter user using their ID.
   * @param userId The user whose tweets should be returned.
   * @param maxTweets The maximum number of tweets to return. Defaults to `200`.
   * @returns An {@link AsyncGenerator} of tweets from the provided user.
   */
  public getTweetsAndRepliesByUserId(
    userId: string,
    maxTweets = 200,
  ): AsyncGenerator<Tweet, void> {
    return getTweetsAndRepliesByUserId(userId, maxTweets, this.auth);
  }

  /**
   * Fetches the first tweet matching the given query.
   *
   * Example:
   * ```js
   * const timeline = scraper.getTweets('user', 200);
   * const retweet = await scraper.getTweetWhere(timeline, { isRetweet: true });
   * ```
   * @param tweets The {@link AsyncIterable} of tweets to search through.
   * @param query A query to test **all** tweets against. This may be either an
   * object of key/value pairs or a predicate. If this query is an object, all
   * key/value pairs must match a {@link Tweet} for it to be returned. If this query
   * is a predicate, it must resolve to `true` for a {@link Tweet} to be returned.
   * - All keys are optional.
   * - If specified, the key must be implemented by that of {@link Tweet}.
   */
  public getTweetWhere(
    tweets: AsyncIterable<Tweet>,
    query: TweetQuery,
  ): Promise<Tweet | null> {
    return getTweetWhere(tweets, query);
  }

  /**
   * Fetches all tweets matching the given query.
   *
   * Example:
   * ```js
   * const timeline = scraper.getTweets('user', 200);
   * const retweets = await scraper.getTweetsWhere(timeline, { isRetweet: true });
   * ```
   * @param tweets The {@link AsyncIterable} of tweets to search through.
   * @param query A query to test **all** tweets against. This may be either an
   * object of key/value pairs or a predicate. If this query is an object, all
   * key/value pairs must match a {@link Tweet} for it to be returned. If this query
   * is a predicate, it must resolve to `true` for a {@link Tweet} to be returned.
   * - All keys are optional.
   * - If specified, the key must be implemented by that of {@link Tweet}.
   */
  public getTweetsWhere(
    tweets: AsyncIterable<Tweet>,
    query: TweetQuery,
  ): Promise<Tweet[]> {
    return getTweetsWhere(tweets, query);
  }

  /**
   * Fetches the most recent tweet from a Twitter user.
   * @param user The user whose latest tweet should be returned.
   * @param includeRetweets Whether or not to include retweets. Defaults to `false`.
   * @returns The {@link Tweet} object or `null`/`undefined` if it couldn't be fetched.
   */
  public getLatestTweet(
    user: string,
    includeRetweets = false,
    max = 200,
  ): Promise<Tweet | null | void> {
    return getLatestTweet(user, includeRetweets, max, this.auth);
  }

  /**
   * Fetches a single tweet.
   * @param id The ID of the tweet to fetch.
   * @returns The {@link Tweet} object, or `null` if it couldn't be fetched.
   */
  public getTweet(id: string): Promise<Tweet | null> {
    if (this.auth instanceof TwitterUserAuth) {
      return getTweet(id, this.auth);
    } else {
      return getTweetAnonymous(id, this.auth);
    }
  }

  /**
   * Returns if the scraper has a guest token. The token may not be valid.
   * @returns `true` if the scraper has a guest token; otherwise `false`.
   */
  public hasGuestToken(): boolean {
    return this.auth.hasToken() || this.authTrends.hasToken();
  }

  /**
   * Returns if the scraper is logged in as a real user.
   * @returns `true` if the scraper is logged in with a real user account; otherwise `false`.
   */
  public async isLoggedIn(): Promise<boolean> {
    return (
      (await this.auth.isLoggedIn()) && (await this.authTrends.isLoggedIn())
    );
  }

  /**
   * Login to Twitter as a real Twitter account. This enables running
   * searches.
   * @param username The username of the Twitter account to login with.
   * @param password The password of the Twitter account to login with.
   * @param email The email to log in with, if you have email confirmation enabled.
   * @param twoFactorSecret The secret to generate two factor authentication tokens with, if you have two factor authentication enabled.
   */
  public async login(
    username: string,
    password: string,
    email?: string,
    twoFactorSecret?: string,
  ): Promise<void> {
    // Swap in a real authorizer for all requests
    const userAuth = new TwitterUserAuth(this.token, this.getAuthOptions());
    await userAuth.login(username, password, email, twoFactorSecret);
    this.auth = userAuth;
    this.authTrends = userAuth;
  }

  /**
   * Log out of Twitter.
   */
  public async logout(): Promise<void> {
    await this.auth.logout();
    await this.authTrends.logout();

    // Swap in guest authorizers for all requests
    this.useGuestAuth();
  }

  /**
   * Retrieves all cookies for the current session.
   * @returns All cookies for the current session.
   */
  public async getCookies(): Promise<Cookie[]> {
    return await this.authTrends
      .cookieJar()
      .getCookies(
        typeof document !== 'undefined' ? document.location.toString() : twUrl,
      );
  }

  /**
   * Set cookies for the current session.
   * @param cookies The cookies to set for the current session.
   */
  public async setCookies(cookies: (string | Cookie)[]): Promise<void> {
    const userAuth = new TwitterUserAuth(this.token, this.getAuthOptions());
    for (const cookie of cookies) {
      await userAuth.cookieJar().setCookie(cookie, twUrl);
    }

    this.auth = userAuth;
    this.authTrends = userAuth;
  }

  /**
   * Clear all cookies for the current session.
   */
  public async clearCookies(): Promise<void> {
    await this.auth.cookieJar().removeAllCookies();
    await this.authTrends.cookieJar().removeAllCookies();
  }

  /**
   * Sets the optional cookie to be used in requests.
   * @param _cookie The cookie to be used in requests.
   * @deprecated This function no longer represents any part of Twitter's auth flow.
   * @returns This scraper instance.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public withCookie(_cookie: string): Scraper {
    console.warn(
      'Warning: Scraper#withCookie is deprecated and will be removed in a later version. Use Scraper#login or Scraper#setCookies instead.',
    );
    return this;
  }

  /**
   * Sets the optional CSRF token to be used in requests.
   * @param _token The CSRF token to be used in requests.
   * @deprecated This function no longer represents any part of Twitter's auth flow.
   * @returns This scraper instance.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public withXCsrfToken(_token: string): Scraper {
    console.warn(
      'Warning: Scraper#withXCsrfToken is deprecated and will be removed in a later version.',
    );
    return this;
  }

  private getAuthOptions(): Partial<TwitterAuthOptions> {
    return {
      fetch: this.options?.fetch,
      transform: this.options?.transform,
    };
  }

  private handleResponse<T>(res: RequestApiResult<T>): T {
    if (!res.success) {
      throw res.err;
    }
    return res.value;
  }

  public async uploadMedia(mediaData: Buffer, mediaType: 'image/jpeg' | 'video/mp4' = 'image/jpeg'): Promise<MediaUploadResponse> {
    try {
      const totalBytes = mediaData.length;
      const isVideo = mediaType === 'video/mp4';
      const mediaCategory = isVideo ? 'tweet_video' : 'tweet_image';
      
      // 1. INIT phase
      console.log(`Initializing ${isVideo ? 'video' : 'image'} upload...`);
      const initResponse = await requestApi<MediaUploadResponse>(
        'https://upload.twitter.com/1.1/media/upload.json',
        this.auth,
        'POST',
        {
          body: new URLSearchParams({
            command: 'INIT',
            total_bytes: totalBytes.toString(),
            media_type: mediaType,
            media_category: mediaCategory
          }).toString(),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      if (!initResponse.success || !initResponse.value.media_id_string) {
        console.error('Init response:', initResponse);
        throw new Error('Failed to initialize media upload');
      }

      const mediaId = initResponse.value.media_id_string;
      console.log('Media upload initialized, ID:', mediaId);

      // 2. APPEND phase - chunk the media for videos
      console.log('Appending media data...');
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for video
      const chunks = isVideo ? Math.ceil(totalBytes / CHUNK_SIZE) : 1;

      for (let i = 0; i < chunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalBytes);
        const chunk = mediaData.slice(start, end);

        const formData = new URLSearchParams();
        formData.append('command', 'APPEND');
        formData.append('media_id', mediaId);
        formData.append('segment_index', i.toString());
        formData.append('media', chunk.toString('base64'));

        const appendResponse = await requestApi(
          'https://upload.twitter.com/1.1/media/upload.json',
          this.auth,
          'POST',
          {
            body: formData.toString(),
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );

        if (!appendResponse.success) {
          console.error('Append response:', appendResponse);
          throw new Error(`Failed to append media chunk ${i + 1}/${chunks}`);
        }

        console.log(`Uploaded chunk ${i + 1}/${chunks}`);
      }

      // 3. FINALIZE phase
      console.log('Finalizing media upload...');
      const finalizeResponse = await requestApi<MediaUploadResponse>(
        'https://upload.twitter.com/1.1/media/upload.json',
        this.auth,
        'POST',
        {
          body: new URLSearchParams({
            command: 'FINALIZE',
            media_id: mediaId
          }).toString(),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      if (!finalizeResponse.success) {
        console.error('Finalize response:', finalizeResponse);
        throw new Error('Failed to finalize media upload');
      }

      // 4. STATUS check for videos
      if (isVideo && finalizeResponse.value.processing_info) {
        console.log('Checking video processing status...');
        return await this.checkMediaProcessingStatus(mediaId);
      }

      console.log('Media upload completed successfully');
      return finalizeResponse.value;
    } catch (error) {
      console.error('Error in uploadMedia:', error);
      throw error;
    }
  }

  // Helper method to check video processing status
  private async checkMediaProcessingStatus(mediaId: string): Promise<MediaUploadResponse> {
    const maxAttempts = 10;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const statusResponse = await requestApi<MediaUploadResponse>(
        `https://upload.twitter.com/1.1/media/upload.json?command=STATUS&media_id=${mediaId}`,
        this.auth,
        'GET'
      );

      if (!statusResponse.success) {
        throw new Error('Failed to check media processing status');
      }

      const processingInfo = statusResponse.value.processing_info;
      
      if (!processingInfo) {
        return statusResponse.value;
      }

      if (processingInfo.state === 'succeeded') {
        return statusResponse.value;
      }

      if (processingInfo.state === 'failed') {
        throw new Error('Video processing failed');
      }

      // Wait for the recommended time before checking again
      const waitTime = (processingInfo.check_after_secs || 5) * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      attempts++;
    }

    throw new Error('Video processing timed out');
  }

  public async likeTweet(tweetId: string): Promise<Response> {
    const response = await requestApi(
      'https://twitter.com/i/api/graphql/lI07N6Otwv1PhnEgXILM7A/FavoriteTweet',
      this.auth,
      'POST',
      {
        body: JSON.stringify({
          variables: {
            tweet_id: tweetId
          },
          queryId: "lI07N6Otwv1PhnEgXILM7A"
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.success) {
      throw response.err;
    }

    return new Response(JSON.stringify(response.value), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  public async followUser(username: string): Promise<Response> {
    try {
      if (!(await this.isLoggedIn())) {
        throw new Error('Must be logged in to follow users');
      }

      // Get user ID from username
      const userIdResult = await getUserIdByScreenName(username, this.auth);
      
      if (!userIdResult.success) {
        throw new Error(`Could not find user with username: ${username}`);
      }

      const userId = userIdResult.value;

      // Make the follow request
      const requestBody = {
        include_profile_interstitial_type: '1',
        skip_status: 'true',
        user_id: userId
      };

      const response = await requestApi(
        `https://api.twitter.com/1.1/friendships/create.json`,
        this.auth,
        'POST',
        {
          body: new URLSearchParams(requestBody).toString(),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': `https://twitter.com/${username}`,
            'X-Twitter-Active-User': 'yes',
            'X-Twitter-Auth-Type': 'OAuth2Session',
            'X-Twitter-Client-Language': 'en',
            'Authorization': `Bearer ${this.token}`
          }
        }
      );

      if (!response.success) {
        throw response.err;
      }

      return new Response(JSON.stringify(response.value), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * Retweet a tweet
   * @param tweetId The ID of the tweet to retweet
   */
  public async retweet(tweetId: string): Promise<Response> {
    const response = await requestApi(
      'https://twitter.com/i/api/graphql/ojPdsZsimiJrUGLR1sjUtA/CreateRetweet',
      this.auth,
      'POST',
      {
        body: JSON.stringify({
          variables: {
            tweet_id: tweetId,
            dark_request: false
          },
          queryId: "ojPdsZsimiJrUGLR1sjUtA"
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.success) {
      throw response.err;
    }

    return new Response(JSON.stringify(response.value), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Quote tweet another tweet
   * @param tweetId The ID of the tweet to quote
   * @param text The text content of your quote tweet
   * @param mediaIds Optional array of media IDs to attach to the quote tweet
   */
  public async quoteTweet(
    tweetId: string, 
    text: string,
    mediaIds?: string[]
  ): Promise<Response> {
    // Changed the URL format to match Twitter's expected format
    const attachmentUrl = `https://twitter.com/twitter/status/${tweetId}`;

    const variables = {
      tweet_text: text,
      dark_request: false,
      attachment_url: attachmentUrl,
      media: mediaIds ? {
        media_entities: mediaIds.map(id => ({ media_id: id })),
        possibly_sensitive: false
      } : undefined,
      semantic_annotation_ids: [] // Added this line
    };

    const response = await requestApi(
      'https://twitter.com/i/api/graphql/SoVnbfCycZ7fERGCwpZkYA/CreateTweet',
      this.auth,
      'POST',
      {
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
        headers: {
          'Content-Type': 'application/json',
          'Referer': `https://twitter.com/twitter/status/${tweetId}` // Added this line
        }
      }
    );

    if (!response.success) {
      throw response.err;
    }

    return new Response(JSON.stringify(response.value), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Check if the current logged-in user is following a specific user
   * @param username The username to check following status for
   * @returns Promise<boolean> True if following the user, false otherwise
   */
  public async isFollowing(username: string): Promise<boolean> {
    try {
      if (!(await this.isLoggedIn())) {
        throw new Error('Must be logged in to check following status');
      }

      // Get user ID from username
      const userIdResult = await getUserIdByScreenName(username, this.auth);
      if (!userIdResult.success) {
        throw new Error(`Could not find user with username: ${username}`);
      }
      const userId = userIdResult.value;

      // Get the logged-in user's ID
      const myUsername = process.env.TWITTER_USERNAME;
      const myUserIdResult = await getUserIdByScreenName(myUsername!, this.auth);
      if (!myUserIdResult.success) {
        throw new Error('Could not get logged in user ID');
      }
      const myUserId = myUserIdResult.value;

      // Check friendship status
      const params = new URLSearchParams({
        source_id: myUserId,
        target_id: userId
      });

      const response = await requestApi<FriendshipResponse>(
        `https://api.twitter.com/1.1/friendships/show.json?${params.toString()}`,
        this.auth,
        'GET',
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.success) {
        throw response.err;
      }

      return response.value.relationship.source.following === true;

    } catch (error) {
      throw error;
    }
  }
}
