async function retryWithBackoff(fn, retries = 5, delay = 1000) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= retries) {
        throw new Error(`Operation failed after ${retries} attempts: ${error.message}`);
      }
      console.error(`Attempt ${attempt} failed. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
}

module.exports = retryWithBackoff;
