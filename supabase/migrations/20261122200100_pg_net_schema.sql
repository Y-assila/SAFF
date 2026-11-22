-- Security Advisor (lint 0014 "extension_in_public"): pg_net was created in schema public.
-- pg_net does not support ALTER EXTENSION ... SET SCHEMA, so it is re-created in `extensions`.
-- Its functions always live in schema `net` (net.http_post), so app.wake_dispatcher and the
-- WhatsApp sweeper are unaffected. Requests still queued in net.http_request_queue are dropped;
-- the minute sweeper re-sends any due notification, so nothing is lost.
drop extension if exists pg_net;
create extension pg_net schema extensions;
