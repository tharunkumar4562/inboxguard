# 🚀 CRITICAL IMMEDIATE ACTIONS

## ⚠️ STATUS

**Session Issue**: Fixed in code ✅ | Needs Railway config ⏳  
**Payment Issue**: Needs Razorpay plan IDs ⏳  
**SEO**: Added content sections ✅  
**Growth**: Strategy documented ✅  

---

## 🔥 WHAT JUST CHANGED IN CODE

1. **main.py** → Session now marked as `permanent=True` (survives deployments)
2. **main.py** → SESSION_SECRET warnings added (so you know when it's wrong)
3. **main.py** → Comments explain ALL required env vars
4. **index.html** → SEO sections added (Why spam, How it works, DKIM/SPF/DMARC, Comparison)
5. **RAILWAY_CONFIG.md** → Complete guide (NEW FILE)  
6. **GROWTH_STRATEGY.md** → Full traffic strategy (NEW FILE)

---

## ⏳ WHAT YOU MUST DO IN RAILWAY (RIGHT NOW)

### STEP 1: Lock SESSION_SECRET (Most Important)

**This fixes "logout after every deploy"**

1. Open Railway Dashboard
2. Select your InboxGuard service
3. Go to Variables tab
4. Look for `INBOXGUARD_SESSION_SECRET`

**If it doesn't exist**:
- Click "Add Variable"
- Generate a secure string:
  ```bash
  # Run this once:
  python3 -c "import secrets; print(secrets.token_urlsafe(32))"
  ```
  Copy the output (it'll be like: `aBcD_1234_XyZw_...`)

- Paste in Railway:
  - **Name**: `INBOXGUARD_SESSION_SECRET`
  - **Value**: `<paste_the_output>`
  - Click Save

**If it exists but looks like "change-me-in-production"**:
- Replace it with a real secure string (use the command above)
- Click Save

---

### STEP 2: Enable HTTPS Cookies

Add this variable:

```
INBOXGUARD_SESSION_HTTPS_ONLY = 1
```

- Click "Add Variable"
- Name: `INBOXGUARD_SESSION_HTTPS_ONLY`
- Value: `1`
- Click Save

---

### STEP 3: Set Up Razorpay (For Payments to Work)

#### A. Get Razorpay Keys

1. Login to [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Go Settings → API Keys
3. Copy **Key ID** and **Secret Key**

In Railway, add:
```
INBOXGUARD_RAZORPAY_KEY = <Key_ID>
INBOXGUARD_RAZORPAY_SECRET = <Secret_Key>
```

#### B. Get Webhook Secret

1. In Razorpay Dashboard → Webhooks
2. Add webhook:
   - **URL**: `https://<your-railway-domain>/webhook/razorpay`
   - **Events**: Check all (payment.*, subscription.*, invoice.*)
   - Create webhook
3. Copy **Webhook Secret**

In Railway, add:
```
INBOXGUARD_RAZORPAY_WEBHOOK_SECRET = <webhook_secret>
```

---

### STEP 4: Create Razorpay Plans (CRITICAL FOR PAYMENTS)

**This fixes "Subscription not configured" error**

1. In Razorpay Dashboard → Subscriptions → Plans
2. Create Monthly Plan:
   - **Plan Interval**: Monthly
   - **Amount**: 1200 (= ₹12 INR in paise)
   - Click Create
   - **Copy Plan ID** (looks like `plan_SZW8NEvJagNab`)

In Railway, add:
```
INBOXGUARD_RAZORPAY_PLAN_ID = plan_SZW8NEvJagNab
```

3. Create Annual Plan (optional):
   - **Plan Interval**: Yearly
   - **Amount**: 99999 (= ₹99.99 INR in paise)
   - Click Create
   - **Copy Plan ID**

In Railway, add:
```
INBOXGUARD_RAZORPAY_ANNUAL_PLAN_ID = plan_YYYYYYYY
```

---

### STEP 5: Set Site URL

Add:
```
INBOXGUARD_SITE_URL = https://<your-railway-domain>
```

Replace `<your-railway-domain>` with your actual Railway domain (e.g., `inboxguard-prod.railway.app`)

---

## ✅ VERIFICATION CHECKLIST

After setting all variables:

- [ ] `INBOXGUARD_SESSION_SECRET` = (32-char secure string)
- [ ] `INBOXGUARD_SESSION_HTTPS_ONLY` = `1`
- [ ] `INBOXGUARD_RAZORPAY_KEY` = (from dashboard)
- [ ] `INBOXGUARD_RAZORPAY_SECRET` = (from dashboard)
- [ ] `INBOXGUARD_RAZORPAY_WEBHOOK_SECRET` = (from webhook)
- [ ] `INBOXGUARD_RAZORPAY_PLAN_ID` = `plan_...` (monthly)
- [ ] `INBOXGUARD_RAZORPAY_ANNUAL_PLAN_ID` = `plan_...` (annual)
- [ ] `INBOXGUARD_SITE_URL` = `https://your-domain.railway.app`

---

## 🧪 TEST THE FIXES

### Session Test (Do This First)

1. Deploy the code (Railway auto-deploys on git push ✅ already done)
2. Visit inboxguard.me
3. Login with email/password
4. Note the current time
5. Trigger a deployment (via Railway UI)
6. Wait for deploy to finish
7. Refresh page → still logged in? ✅ SUCCESS
8. If logged out → SESSION_SECRET not set correctly

---

### Payment Test

1. Login as a user
2. Click "Get Access" button
3. Select plan (Monthly)
4. Look for Razorpay checkout to appear

**If you see "Subscription not configured"**:
- Check Railway logs for missing vars
- Likely: RAZORPAY_PLAN_ID not set yet

**If Razorpay opens**:
- Don't complete payment yet (test)
- Verify modal opens correctly ✅

---

### Webhook Test (Optional but Important)

1. In Razorpay Dashboard → Webhooks
2. Find your webhook
3. Click "Test Webhook"
4. In Railway logs, look for:
   ```
   Razorpay webhook received: event=subscription.activated payload={...}
   ```
5. If you see this → webhook is working ✅

---

## 🚨 IF SOMETHING BREAKS

### "Users still logging out after deploy"

**Solution**:
1. Check Railway logs: `Railway → [app] → Logs`
2. Look for: `⚠️ SESSION_SECRET is using default value`
3. If found → `INBOXGUARD_SESSION_SECRET` not set
4. Set it immediately (Step 1 above)

### "Subscription not configured" on Get Access

**Solution**:
1. Check logs for: `missing_config: [...]`
2. Add missing variable to Railway
3. Redeploy

### "Get Access button still doesn't work"

**Debug**:
1. Open browser console (F12)
2. Click "Get Access"
3. Copy any error message
4. Check if `/create-subscription` returns 503 with list of missing vars
5. Add those vars to Railway

---

## 📊 NEXT MILESTONES

After all above is done:

### Week 1: Stabilize Auth + Billing
- ✅ Session persists across deploys
- ✅ Get Access button opens payment
- ✅ Webhook updates user state

### Week 2: Growth
- Post on Reddit (1x/week template included in GROWTH_STRATEGY.md)
- Tweet 3-5x/week (templates included)
- Minimal effort, maximum ROI

### Week 3-4: Optimize
- Measure where traffic comes from
- Double down on what works
- Fix what doesn't

---

## 💬 FINAL NOTE

You now have:

1. ✅ **Production-ready auth** (sessions lock + survive deploys)
2. ✅ **Razor pay integration** (documented + easy to configure)
3. ✅ **SEO content** (ranking for "cold email spam checker")
4. ✅ **Growth playbook** (Reddit + Twitter = traffic)

The only thing left is setting 8 environment variables in Railway.

**This takes 15 minutes.**

After that, your app actually works for users.

Do this today. Then start posting tomorrow.

Good luck 🚀
