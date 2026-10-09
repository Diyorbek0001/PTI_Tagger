-- Keep the stock reminder text accurate now that each submission starts a
-- rolling per-unit PTI cycle. Preserve any custom template configured by users.
update public.pti_reminder_settings
set message_template = E'🔔 PTI cycle reminder\n\n@driver — Unit @unit still needs a PTI for the current cycle.\n\nLast PTI: @lastPTI\nLast notified: @lastNotified\n\nPlease send a clear photo or video in this group, then reply directly to it with /pti.'
where singleton = true
  and message_template = E'🔔 Weekly PTI reminder\n\n@driver — Unit @unit still needs a PTI for this week.\n\nLast PTI: @lastPTI\nLast notified: @lastNotified\n\nPlease send a clear photo or video in this group, then reply directly to it with /pti.';
