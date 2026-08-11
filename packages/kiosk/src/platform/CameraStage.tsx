/**
 * What fills the camera's box before the camera does.
 *
 * Opening a document camera takes a second or two, and the old sequence made
 * every one of those steps visible: an empty element with no height, then a
 * flat line, then the box snapping open to the stream's real shape, then a
 * picture. Four layouts to arrive at one, and the page shoved everything below
 * it down the screen twice on the way.
 *
 * None of that is the camera being slow — it is the page being sized by the
 * camera. A `<video>` has no dimensions until `loadedmetadata` fires, so
 * anything laid out from it is laid out late by definition. The fix is to stop
 * asking: the box is sized from the aspect this station saw last time (see
 * `lastAspect`), so it is the right size and shape before a device has even
 * been opened, and the stream lands inside a hole that was already waiting for
 * it.
 *
 * What sits in the hole meanwhile is this — deliberately alive rather than a
 * spinner. The station is a piece of furniture in a room full of children; a
 * grey rectangle reads as broken, and a rectangle with something growing in it
 * reads as "nearly ready". It is drawn rather than downloaded: a GIF at this
 * size is a few hundred KB that has to arrive before it can reassure anyone,
 * and this is CSS that is already in the bundle, sharp at every resolution and
 * instant with the network off.
 */

const LEAVES = ['🌿', '🍃', '🌱']

export default function CameraStage({ note }: { note: string }) {
  return (
    <div style={wrap}>
      <style>{`
        /* The warm sweep. Slow on purpose — a fast shimmer reads as urgency,
           and nothing here is urgent. */
        @keyframes atrium-sweep {
          0%   { transform: translateX(-60%); }
          100% { transform: translateX(160%); }
        }
        @keyframes atrium-float {
          0%, 100% { transform: translateY(0) rotate(-6deg); }
          50%      { transform: translateY(-14px) rotate(6deg); }
        }
        @keyframes atrium-lens {
          0%, 100% { transform: scale(1);    opacity: 0.9; }
          50%      { transform: scale(1.06); opacity: 1; }
        }
        .stage-sweep {
          position: absolute; inset: 0;
          background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.16) 50%, transparent 80%);
          animation: atrium-sweep 2.8s ease-in-out infinite;
        }
        .stage-leaf { animation: atrium-float 3.2s ease-in-out infinite; }
        .stage-lens { animation: atrium-lens 2.2s ease-in-out infinite; }

        /* A child watching a station is not a reason to move anything. */
        @media (prefers-reduced-motion: reduce) {
          .stage-sweep, .stage-leaf, .stage-lens { animation: none; }
        }
      `}</style>

      <div className="stage-sweep" />

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div className="stage-lens" style={{ fontSize: 64, lineHeight: 1 }}>📷</div>

        <div style={{ display: 'flex', gap: 18 }}>
          {LEAVES.map((leaf, i) => (
            <span
              key={leaf}
              className="stage-leaf"
              style={{ fontSize: 26, animationDelay: `${i * 0.45}s`, display: 'inline-block' }}
            >
              {leaf}
            </span>
          ))}
        </div>

        <div style={{ color: '#fff', fontSize: 17, fontWeight: 600, textAlign: 'center', textShadow: '0 1px 3px rgba(0,0,0,0.35)' }}>
          {note}
        </div>
      </div>
    </div>
  )
}

/**
 * Deep green rather than the station's warm white: this is the inside of the
 * camera's box, and it hands over to a picture of a desk. Fading from a pale
 * panel to a lit photograph is a flash; fading from this is a lamp coming on.
 */
const wrap: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  background: 'linear-gradient(140deg, #17342a 0%, #1f4a37 55%, #2b6248 100%)',
}
