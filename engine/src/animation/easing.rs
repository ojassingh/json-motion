use crate::schema::Easing;

pub(crate) fn ease(p: f64, easing: Easing) -> f64 {
    match easing {
        Easing::Linear => p,
        Easing::EaseIn => p * p,
        Easing::EaseOut => 1.0 - (1.0 - p) * (1.0 - p),
        Easing::EaseInOut => {
            if p < 0.5 {
                2.0 * p * p
            } else {
                1.0 - (-2.0 * p + 2.0_f64).powi(2) / 2.0
            }
        }
        Easing::EaseInExpo => {
            if p == 0.0 {
                0.0
            } else {
                2.0_f64.powf(10.0 * p - 10.0)
            }
        }
        Easing::EaseOutExpo => {
            if p == 1.0 {
                1.0
            } else {
                1.0 - 2.0_f64.powf(-10.0 * p)
            }
        }
        Easing::EaseInBack => {
            let c = 1.701_58;
            (c + 1.0) * p.powi(3) - c * p.powi(2)
        }
        Easing::EaseOutBack => {
            let c = 1.701_58;
            let q = p - 1.0;
            1.0 + (c + 1.0) * q.powi(3) + c * q.powi(2)
        }
        Easing::Spring => 1.0 - (-6.0 * p).exp() * (p * 10.0).cos(),
    }
}
