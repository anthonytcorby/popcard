// Popcard analytics — central wrapper for Vercel Web Analytics + PostHog.
//
// Usage:
//   window.PopcardAnalytics.track(event, props)   // fan-out to both providers
//   window.PopcardAnalytics.identify(id, props)   // PostHog identify (after login)
//   window.PopcardAnalytics.reset()               // PostHog reset (after logout)
//   window.PopcardAnalytics.flag(name)            // PostHog feature flag check
//
// PostHog only loads once the user accepts cookies (see cookies.js calling
// loadPostHog()). Events fired before then are queued and flushed on init.
(function () {
  const queue = [];               // [['capture', evt, props] | ['identify', id, props]]
  let phReady = false;
  let phLoading = false;

  // -------------- Vercel branch (existing behaviour) ---------------------------
  function vercelTrack(event, props) {
    if (typeof window.va === 'function') {
      window.va('event', { name: event, ...(props ? { data: props } : {}) });
    }
  }

  // -------------- PostHog branch ----------------------------------------------
  function phReadyNow() {
    return !!(window.posthog && window.posthog.__loaded);
  }

  function flushQueue() {
    while (queue.length) {
      const [type, a, b] = queue.shift();
      try {
        if (type === 'capture') window.posthog.capture(a, b);
        else if (type === 'identify') window.posthog.identify(a, b);
        else if (type === 'reset') window.posthog.reset();
      } catch (err) {
        console.error('PostHog flush failed', err);
      }
    }
  }

  async function loadPostHog() {
    if (phReady || phLoading) return;
    phLoading = true;

    let cfg;
    try {
      const res = await fetch('/api/config', { credentials: 'same-origin' });
      cfg = await res.json();
    } catch (err) {
      phLoading = false;
      return;
    }
    if (!cfg || !cfg.posthog_key) {
      phLoading = false;
      return;   // No key configured — silently skip PostHog
    }

    // Standard PostHog JS snippet (async loader). Calls made on window.posthog
    // before the real SDK lands get queued internally by the stub.
    /* eslint-disable */
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]);t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    /* eslint-enable */

    window.posthog.init(cfg.posthog_key, {
      api_host: cfg.posthog_host,
      person_profiles: 'identified_only',  // only create person profiles for signed-in users
      capture_pageview: false,             // we fire our own pageview events in page.js
      capture_pageleave: true,
      autocapture: true,
      session_recording: {
        // Mask passwords and any input with class `ph-no-capture` or `ph-mask`.
        maskAllInputs: false,
        maskInputOptions: { password: true },
        maskTextSelector: '.ph-mask',
        blockSelector: '.ph-no-capture',
      },
      loaded: (ph) => {
        phReady = true;
        flushQueue();
      },
    });
  }

  // -------------- Public surface ----------------------------------------------
  window.PopcardAnalytics = {
    track(event, props) {
      vercelTrack(event, props);
      if (phReady) {
        try { window.posthog.capture(event, props); }
        catch (err) { console.error('PostHog capture failed', err); }
      } else {
        queue.push(['capture', event, props]);
      }
    },

    identify(distinctId, props) {
      if (!distinctId) return;
      if (phReady) {
        try { window.posthog.identify(distinctId, props); }
        catch (err) { console.error('PostHog identify failed', err); }
      } else {
        queue.push(['identify', distinctId, props]);
      }
    },

    reset() {
      if (phReady) {
        try { window.posthog.reset(); }
        catch (err) { console.error('PostHog reset failed', err); }
      } else {
        queue.push(['reset']);
      }
    },

    flag(name) {
      return phReady ? window.posthog.isFeatureEnabled(name) : false;
    },

    // Called by cookies.js once the user accepts analytics consent
    loadPostHog,

    // Internal: lets other scripts check if PostHog is up yet
    isReady: phReadyNow,
  };
})();
