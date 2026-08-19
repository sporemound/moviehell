const securityPolicyUrl = './SECURITY.md';

export default function Faq() {
  return (
    <section className="faq-page" aria-labelledby="faq-heading">
      <div className="panel faq-hero">
        <p className="panel-kicker">Ask the projection booth</p>
        <h2 id="faq-heading" tabIndex={-1}>Movie Hell FAQ</h2>
        <p className="faq-lede">
          Movie Hell is a shared aggregation host: members browse the catalog and choose channels,
          each with its own chat and shared canvas.
        </p>

        <div className="approval-explainer" aria-labelledby="approval-heading">
          <div>
            <p className="panel-kicker">Catalog admission by moderator consensus</p>
            <h3 id="approval-heading">Approval adds choices—it does not make them for you</h3>
            <p>
              Any signed-in member may pitch a channel for the shared catalog. Only votes from
              designated moderators count; administrators are included in that group. Once it is
              approved, every member with access remains free to pick it, skip it, or move between
              channels.
            </p>
          </div>
          <ol className="approval-steps">
            <li><span>1</span><strong>Submit</strong><small>Name the channel and make the case.</small></li>
            <li><span>2</span><strong>Pending</strong><small>The request appears on the marquee.</small></li>
            <li><span>3</span><strong>Moderator vote</strong><small>One non-editable vote per moderator and request.</small></li>
            <li><span>4</span><strong>Resolve</strong><small>Either side reaching the shown threshold settles it.</small></li>
          </ol>
          <p className="faq-note">
            The required threshold is shown on each request card. Approval creates both the
            screening room and its shared canvas automatically.
          </p>
        </div>
      </div>

      <div className="faq-grid">
        <article className="panel faq-card faq-card-wide">
          <p className="faq-card-label">The basics</p>
          <h3>What is Movie Hell?</h3>
          <p>
            It is an aggregate host for film-centered channels. Moderator voting determines which
            proposals enter the shared catalog; it does not subscribe users, rank their interests,
            or decide where they participate. You choose your own screen.
          </p>
        </article>

        <article className="panel faq-card faq-card-wide">
          <p className="faq-card-label">Cinema Stage</p>
          <h3>How do I watch streams inside Movie Hell?</h3>
          <p>
            Click <strong>Watch on Stage</strong> on any stream in the directory, or select a channel from
            the marquee dropdown on the cinema stage. The animated red velvet curtains will dramatically
            part open, revealing the stream player with warm stage footlights and projector glow.
            Clicking <strong>Draw Curtains</strong> or <strong>Leave Screening</strong> sweeps the velvet curtains
            closed and powers down the projection booth.
          </p>
        </article>

        <article className="panel faq-card">
          <p className="faq-card-label">Accounts</p>
          <h3>What do I need to sign up?</h3>
          <p>
            A valid email address, a nickname of 1–48 characters, and a password of 12–128
            characters. Use a password unique to Movie Hell.
          </p>
        </article>

        <article className="panel faq-card">
          <p className="faq-card-label">Accounts</p>
          <h3>Do I need Discord, Magma, or another login?</h3>
          <p>
            No. Chat, reactions, channel requests, and the shared canvas all use the same Movie
            Hell account. There is no separate third-party canvas sign-in.
          </p>
        </article>

        <article className="panel faq-card">
          <p className="faq-card-label">Moderation</p>
          <h3>Who can become a moderator?</h3>
          <p>
            New accounts begin as ordinary member accounts. The site operator must explicitly
            designate moderators. Administrators also count as moderators and have additional
            enforcement controls.
          </p>
        </article>

        <article className="panel faq-card">
          <p className="faq-card-label">Channels</p>
          <h3>Why can&apos;t I submit a channel request?</h3>
          <p>
            Include a channel name and programming reason. A matching room or pending request
            may already exist, and repeated submissions are rate-limited. Wait before retrying
            if you have made several attempts.
          </p>
        </article>

        <article className="panel faq-card">
          <p className="faq-card-label">Privacy</p>
          <h3>Is my email shown to other members?</h3>
          <p>
            The room interface shows your nickname—not your email—with messages and requests.
            Movie Hell is an early-stage service, so do not put private or sensitive material in
            chats, pitches, drawings, or uploads.
          </p>
        </article>

        <article className="panel faq-card">
          <p className="faq-card-label">Chat</p>
          <h3>Are messages temporary?</h3>
          <p>
            No. Messages are stored, and recent history is loaded for signed-in members of approved
            rooms. Removal from a room prevents future access and posting there.
          </p>
        </article>

        <article className="panel faq-card">
          <p className="faq-card-label">Canvas</p>
          <h3>How does the shared canvas work?</h3>
          <p>
            Each approved room has a synchronized drawing screen for mouse, touch, or pen input.
            It uses the room&apos;s live connection, so drawing pauses when chat is disconnected.
            Chat remains the text-accessible collaboration channel.
          </p>
        </article>

        <article className="panel faq-card">
          <p className="faq-card-label">Reactions</p>
          <h3>Who can add custom emoji?</h3>
          <p>
            Everyone signed in can use the cinema reaction catalog. Moderators may add custom,
            static PNG reactions up to 256×256 pixels and 320 KiB; shortcodes must be unique.
          </p>
        </article>

        <article className="panel faq-card">
          <p className="faq-card-label">Sessions</p>
          <h3>Why did refreshing sign me out?</h3>
          <p>
            Refreshing or closing the page currently returns you to the login screen. Log in again
            with the same account; your account was not deleted.
          </p>
        </article>

        <article className="panel faq-card">
          <p className="faq-card-label">Troubleshooting</p>
          <h3>What should I include in an error report?</h3>
          <p>
            Share the approximate time, the action you attempted, and the visible error message.
            Never send your password, session token, or other credentials.
          </p>
        </article>

        <article className="panel faq-card faq-card-wide">
          <p className="faq-card-label">Security</p>
          <h3>How do I report a security problem?</h3>
          <p>
            Do not post suspected vulnerabilities in public issues, chats, or request pitches.
            Follow the repository&apos;s private-reporting guidance and allow maintainers time to
            investigate before disclosure.
          </p>
          <a className="faq-inline-link" href={securityPolicyUrl} target="_blank" rel="noreferrer">
            Read the private-reporting policy <span aria-hidden="true">↗</span>
          </a>
        </article>
      </div>
    </section>
  );
}
