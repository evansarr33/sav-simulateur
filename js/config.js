(function(global){
  if (global.SUPABASE_CONFIG) {
    return;
  }

  const config = Object.freeze({
    url: "https://bkgpmfqzkzxehjgshnga.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrZ3BtZnF6a3p4ZWhqZ3NobmdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDM2NDAsImV4cCI6MjA3NTQ3OTY0MH0.1BHkv-grxjDz92bovjDjb-8dHaWPSvQruudVx1kkdqw"
  });

  Object.defineProperty(global, "SUPABASE_CONFIG", {
    value: config,
    writable: false,
    configurable: false
  });
})(window);
