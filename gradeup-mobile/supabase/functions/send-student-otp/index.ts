// @ts-nocheck — Deno edge function; runs on Supabase Deno runtime, not the RN TS compiler.
// Edge Function: send-student-otp
// Generates a 6-digit OTP, stores it in the DB, and emails it to the student.
//
// Deploy env vars required:
//   RESEND_API_KEY  — from https://resend.com
//   SUPABASE_URL    — auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 1. Authenticate the requesting user ──────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create user-scoped client (validates JWT)
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Parse body ────────────────────────────────────────────────────────
    const { student_email } = await req.json();
    if (!student_email || !student_email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Invalid student email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. Generate 6-digit OTP ──────────────────────────────────────────────
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    // ── 4. Store OTP in DB using service role ────────────────────────────────
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Check if already verified
    const { data: profile } = await adminClient
      .from('profiles')
      .select('student_verified')
      .eq('id', user.id)
      .single();

    if (profile?.student_verified) {
      return new Response(JSON.stringify({ status: 'already_verified' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: upsertError } = await adminClient
      .from('student_otp_verifications')
      .upsert({
        user_id: user.id,
        student_email: student_email.trim().toLowerCase(),
        otp_code: otp,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (upsertError) {
      console.error('DB upsert error:', upsertError);
      return new Response(JSON.stringify({ error: 'Failed to create verification code' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 5. Send email via Resend ─────────────────────────────────────────────
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      console.error('RESEND_API_KEY not set');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="font-size: 32px; font-weight: 900; letter-spacing: -1px; color: #111;">Rencana</div>
          <div style="color: #888; font-size: 14px; margin-top: 4px;">Student Marketplace</div>
        </div>
        
        <div style="background: #f9f9f9; border-radius: 20px; padding: 32px; text-align: center;">
          <div style="font-size: 18px; font-weight: 700; color: #111; margin-bottom: 8px;">
            Your Verification Code
          </div>
          <div style="color: #666; font-size: 14px; margin-bottom: 28px; line-height: 1.5;">
            Enter this code in the Rencana app to verify your student status.
          </div>
          
          <div style="background: #fff; border: 2px solid #e8e8e8; border-radius: 16px; padding: 20px 32px; display: inline-block;">
            <div style="font-size: 40px; font-weight: 900; letter-spacing: 12px; color: #111; font-variant-numeric: tabular-nums;">
              ${otp}
            </div>
          </div>
          
          <div style="color: #999; font-size: 12px; margin-top: 20px;">
            This code expires in <strong>10 minutes</strong>. Do not share it with anyone.
          </div>
        </div>
        
        <div style="text-align: center; color: #ccc; font-size: 12px; margin-top: 24px;">
          If you didn't request this, you can safely ignore this email.
        </div>
      </div>
    `;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Rencana <noreply@aizztech.com>',
        to: [student_email.trim()],
        subject: `${otp} is your Rencana verification code`,
        html: emailHtml,
      }),
    });

    if (!emailRes.ok) {
      const emailErr = await emailRes.text();
      console.error('Resend error:', emailErr);
      
      // Parse the Resend error message to show it to the user
      let errorMessage = 'Failed to send email. Please try again.';
      try {
        const parsedErr = JSON.parse(emailErr);
        if (parsedErr.message) errorMessage = parsedErr.message;
      } catch (e) {
        // use raw text if not json
        if (emailErr) errorMessage = emailErr;
      }
      
      return new Response(JSON.stringify({ error: `Email Error: ${errorMessage}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ status: 'sent', email: student_email }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
