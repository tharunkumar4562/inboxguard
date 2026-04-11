from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
import joblib

# Expand this dataset as you collect more real emails
# Format: (email text, class label)
data = [
    ("Your GitHub account was accessed", "transactional"),
    ("Reset your password now", "transactional"),
    ("Hi John, quick question about your product", "outreach"),
    ("Limited time offer, act now!", "marketing"),
    ("Click this link to verify account urgently", "spam"),
]

texts, labels = zip(*data)

vectorizer = TfidfVectorizer(ngram_range=(1,2), stop_words="english")
X = vectorizer.fit_transform(texts)

model = LogisticRegression()
model.fit(X, labels)

# Save model and vectorizer
joblib.dump(model, "email_classifier.pkl")
joblib.dump(vectorizer, "vectorizer.pkl")

print("Model and vectorizer saved.")
