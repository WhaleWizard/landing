import { useState, useCallback, memo, useRef } from "react";
import { useNavigate } from "react-router";
import { motion, useInView } from "motion/react";
import {
  Send,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Phone,
  User,
  Globe,
  DollarSign,
  Briefcase,
  AlertCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { trackLead } from "../consent/consent";
import { API_ROUTES } from "../config";
import { usePerformanceMode } from "../hooks/usePerformanceMode";

type ServiceType = "meta-ads" | "google-ads" | "consult";

interface LandingFormProps {
  service: ServiceType;
  title?: string;
  buttonText?: string;
}

const serviceLabels: Record<ServiceType, string> = {
  "meta-ads": "Meta Ads",
  "google-ads": "Google Ads",
  consult: "Консультация",
};

const budgetOptions = [
  { value: "до $1000", label: "до $1000" },
  { value: "$1k-$5k", label: "$1k-$5k" },
  { value: "$5k-$10k", label: "$5k-$10k" },
  { value: "$10k+", label: "$10k+" },
];

function LandingForm({
  service,
  title = "Оставить заявку",
  buttonText = "Отправить заявку",
}: LandingFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    contact: "",
    website: "",
    budget: "",
    experience: "",
    problem: "",
  });
  const [hpTrap, setHpTrap] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  const navigate = useNavigate();
  const formRef = useRef<HTMLDivElement>(null);
  const inView = useInView(formRef, { once: true, margin: "-80px" });
  const performance = usePerformanceMode();

  const handleChange = useCallback(
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!agreed) {
        alert("Пожалуйста, подтвердите согласие с условиями");
        return;
      }
      setIsSubmitting(true);

      const eventId = crypto.randomUUID();

      try {
        const res = await fetch(API_ROUTES.lead, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            phone: formData.contact,
            message:
              service === "consult"
                ? `Опыт: ${formData.experience}\nПроблема: ${formData.problem}`
                : `Сайт: ${formData.website}\nБюджет: ${formData.budget}`,
            budget: formData.budget,
            contactMethod: "telegram",
            telegramUsername: formData.contact,
            service: serviceLabels[service],
            event_id: eventId,
            hp_trap: hpTrap,
            page_url: window.location.href,
            referrer: document.referrer || undefined,
          }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }

        setIsSubmitted(true);
        setFormData({
          name: "",
          contact: "",
          website: "",
          budget: "",
          experience: "",
          problem: "",
        });
        setHpTrap("");
        setAgreed(false);
        trackLead(eventId);

        setTimeout(() => setIsSubmitted(false), 5000);
        setTimeout(() => navigate("/thank-you"), 800);
      } catch (error) {
        console.error(error);
        const message =
          error instanceof Error ? error.message : "Ошибка отправки формы";
        alert(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, navigate, agreed, service, hpTrap],
  );

  const renderField = (
    name: string,
    label: string,
    icon: React.ReactNode,
    placeholder: string,
    required = true,
    type = "text",
  ) => (
    <div className="relative">
      <label className="block text-sm mb-2 font-medium flex items-center gap-2">
        {icon}
        {label} {required && "*"}
      </label>
      <div className="relative">
        <Input
          name={name}
          type={type}
          required={required}
          value={formData[name as keyof typeof formData]}
          onChange={handleChange}
          onFocus={() => setFocusedField(name)}
          onBlur={() => setFocusedField(null)}
          placeholder={placeholder}
          className={`bg-background/60 border-border/50 focus:border-primary focus:bg-background/80 transition-colors ${performance.allowBackdropBlur ? "backdrop-blur-sm" : ""} pl-4`}
        />
        {focusedField === name && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute inset-0 rounded-lg border-2 border-primary/50 pointer-events-none"
          />
        )}
      </div>
    </div>
  );

  return (
    <motion.div
      ref={formRef}
      id="contact"
      initial={{ opacity: 0, y: performance.revealDistance }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: performance.revealDuration,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "620px" }}
    >
      <div
        className={`relative p-6 md:p-8 rounded-3xl bg-card/70 border border-border shadow-2xl overflow-hidden ${performance.allowBackdropBlur ? "backdrop-blur-md" : ""}`}
      >
        {/* Background effects */}
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10 opacity-50" />
        {performance.allowAnimatedBackgrounds && (
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-primary/5 to-accent/5 animate-pulse" />
        )}
        <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-br from-primary/16 to-transparent rounded-3xl blur-xl" />
        <div className="absolute bottom-0 left-0 w-28 h-28 bg-gradient-to-tr from-accent/16 to-transparent rounded-3xl blur-xl" />

        <div className="relative z-10">
          {isSubmitted ? (
            <motion.div
              className="text-center py-12 space-y-4"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center animate-pulse">
                  <CheckCircle2 className="w-8 h-8 text-white" />
                </div>
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-accent opacity-50 animate-ping" />
              </div>
              <h3 className="text-xl md:text-2xl font-bold">
                Спасибо за заявку!
              </h3>
              <p className="text-sm md:text-base text-muted-foreground">
                Я свяжусь с вами в ближайшее время
              </p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Title */}
              <div className="text-center mb-6">
                <h3 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                  {title}
                </h3>
              </div>

              {/* Honeypot */}
              <div
                style={{ position: "absolute", left: "-9999px" }}
                aria-hidden="true"
              >
                <input
                  type="text"
                  name="hp_trap"
                  value={hpTrap}
                  onChange={(e) => setHpTrap(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              {/* Hidden service field */}
              <input type="hidden" name="service" value={service} />

              {/* Name */}
              {renderField(
                "name",
                "Имя",
                <User className="w-4 h-4 text-primary" />,
                "Ваше имя",
              )}

              {/* Contact */}
              {renderField(
                "contact",
                "Telegram / WhatsApp",
                <MessageCircle className="w-4 h-4 text-primary" />,
                "@username или +7...",
              )}

              {/* Service-specific fields */}
              {service !== "consult" && (
                <>
                  {renderField(
                    "website",
                    "Сайт / Ниша",
                    <Globe className="w-4 h-4 text-primary" />,
                    "example.com или описание ниши",
                  )}

                  {/* Budget Select */}
                  <div className="relative">
                    <label className="block text-sm mb-2 font-medium flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-primary" />
                      Месячный бюджет
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {budgetOptions.map((option) => (
                        <motion.button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              budget: option.value,
                            }))
                          }
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                            formData.budget === option.value
                              ? "bg-primary/20 border-primary text-primary shadow-lg shadow-primary/20"
                              : "bg-background/50 border-border/50 hover:border-primary/50"
                          }`}
                        >
                          {option.label}
                          {formData.budget === option.value && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="ml-2 inline-block"
                            >
                              <CheckCircle2 className="w-4 h-4 inline" />
                            </motion.span>
                          )}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {service === "consult" && (
                <>
                  {renderField(
                    "experience",
                    "Опыт в таргете",
                    <Briefcase className="w-4 h-4 text-primary" />,
                    "Новичок / 1 год / 3+ года...",
                  )}

                  <div className="relative">
                    <label className="block text-sm mb-2 font-medium flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-primary" />
                      Главная проблема *
                    </label>
                    <div className="relative">
                      <Textarea
                        name="problem"
                        required
                        value={formData.problem}
                        onChange={handleChange}
                        onFocus={() => setFocusedField("problem")}
                        onBlur={() => setFocusedField(null)}
                        placeholder="Опишите вашу главную проблему..."
                        rows={3}
                        className={`bg-background/60 border-border/50 focus:border-primary focus:bg-background/80 transition-colors resize-none ${performance.allowBackdropBlur ? "backdrop-blur-sm" : ""}`}
                      />
                      {focusedField === "problem" && (
                        <motion.div
                          initial={{ scale: 0.95, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="absolute inset-0 rounded-lg border-2 border-primary/50 pointer-events-none"
                        />
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Agreement */}
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setAgreed(!agreed)}
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                    agreed
                      ? "bg-primary border-primary"
                      : "border-border/50 hover:border-primary/50"
                  }`}
                >
                  {agreed && <CheckCircle2 className="w-3 h-3 text-white" />}
                </button>
                <label className="text-xs text-muted-foreground leading-relaxed">
                  Я согласен с{" "}
                  <a
                    href="/privacy-policy"
                    className="text-primary hover:underline"
                  >
                    политикой конфиденциальности
                  </a>{" "}
                  и{" "}
                  <a href="/offer" className="text-primary hover:underline">
                    публичной офертой
                  </a>
                </label>
              </div>

              {/* Submit */}
              <motion.div
                whileHover={performance.allowTilt ? { scale: 1.01 } : undefined}
                whileTap={{ scale: 0.99 }}
              >
                <Button
                  type="submit"
                  disabled={isSubmitting || !agreed}
                  className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden shadow-lg shadow-primary/30 h-12 text-base"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <span className="relative">{buttonText}</span>
                      <Send className="ml-2 w-4 h-4 relative group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>
              </motion.div>
            </form>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default memo(LandingForm);
