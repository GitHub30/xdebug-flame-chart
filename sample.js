/**
 * Programmatic generator for a sample computerized Xdebug trace file (.xt)
 */

export function generateSampleTrace() {
  let time = 0.0;
  let mem = 245760; // Start at 240KB
  let funcId = 0;
  const lines = [];
  
  lines.push("Version: 3.1.5");
  lines.push("File format: 1");
  lines.push("TRACE START [2026-05-30 12:00:00]");
  
  const stack = [];
  
  function enter(name, isUser, filename, line, args = []) {
    funcId++;
    const level = stack.length + 1;
    time += Math.random() * 0.0004 + 0.0001; // Increase time slightly
    mem += Math.floor(Math.random() * 12288) - 2048; // Allocate/Deallocate memory
    
    const row = [
      level,
      funcId,
      '0',
      time.toFixed(6),
      mem,
      name,
      isUser ? '1' : '0',
      '',
      filename || '',
      line || '1',
      args.length,
      ...args
    ];
    lines.push(row.join('\t'));
    
    const node = { id: funcId, name, level };
    stack.push(node);
    return node;
  }
  
  function exit(durationCoeff = 1.0) {
    if (stack.length === 0) return;
    const node = stack.pop();
    time += (Math.random() * 0.0008 + 0.0002) * durationCoeff; // Processing duration
    mem += Math.floor(Math.random() * 6144) - 3072; // Post-execution deallocations
    
    const row = [
      node.level,
      node.id,
      '1',
      time.toFixed(6),
      mem,
      '',
      '',
      '',
      '',
      ''
    ];
    lines.push(row.join('\t'));
  }

  // Simulate typical PHP framework flow
  enter('main', 1, '/var/www/html/public/index.php', 1);
    
    // Bootstrap & Autoloader initialization
    enter('require_once', 0, '/var/www/html/public/index.php', 8, ['/var/www/html/vendor/autoload.php']);
      enter('ComposerAutoloaderInit::getLoader', 1, '/var/www/html/vendor/autoload.php', 12);
        enter('Composer\\Autoload\\ClassLoader::__construct', 1, '/var/www/html/vendor/composer/ClassLoader.php', 50);
        exit(0.2);
        enter('Composer\\Autoload\\ClassLoader::register', 1, '/var/www/html/vendor/composer/ClassLoader.php', 135);
          enter('spl_autoload_register', 0, '/var/www/html/vendor/composer/ClassLoader.php', 137);
          exit(0.1);
        exit(0.5);
      exit(0.8);
    exit(1.2);
    
    // Application Startup
    enter('App\\Core\\Application::__construct', 1, '/var/www/html/src/Core/Application.php', 15);
      enter('App\\Core\\Config::load', 1, '/var/www/html/src/Core/Config.php', 30);
        enter('file_exists', 0, '/var/www/html/src/Core/Config.php', 32, ['/var/www/html/config/app.json']);
        exit(0.1);
        enter('file_get_contents', 0, '/var/www/html/src/Core/Config.php', 35, ['/var/www/html/config/app.json']);
        exit(0.8);
        enter('json_decode', 0, '/var/www/html/src/Core/Config.php', 38);
        exit(0.3);
      exit(1.0);
      
      // Logger initialize
      enter('App\\Core\\Logger::init', 1, '/var/www/html/src/Core/Logger.php', 22);
        enter('fopen', 0, '/var/www/html/src/Core/Logger.php', 25, ['/var/www/html/storage/logs/app.log', 'a']);
        exit(0.4);
      exit(0.6);
    exit(1.5);
    
    // Application Run
    enter('App\\Core\\Application::run', 1, '/var/www/html/src/Core/Application.php', 40);
      
      // Route Dispatching
      enter('App\\Core\\Router::dispatch', 1, '/var/www/html/src/Core/Router.php', 80);
        enter('App\\Core\\Request::getInstance', 1, '/var/www/html/src/Core/Request.php', 15);
        exit(0.2);
        enter('App\\Core\\Request::getPath', 1, '/var/www/html/src/Core/Request.php', 25);
        exit(0.2);
        
        enter('App\\Core\\Router::match', 1, '/var/www/html/src/Core/Router.php', 112);
          // Loop through registered routes
          for (let r = 0; r < 6; r++) {
            enter(`App\\Core\\Route::check`, 1, '/var/www/html/src/Core/Route.php', 45);
              enter('preg_match', 0, '/var/www/html/src/Core/Route.php', 48);
              exit(0.15);
            exit(0.3);
          }
        exit(1.5);
        
        // Controller Execution
        enter('App\\Core\\Router::callController', 1, '/var/www/html/src/Core/Router.php', 145);
          enter('App\\Controller\\UserController::show', 1, '/var/www/html/src/Controller/UserController.php', 28);
            
            // Authentication check
            enter('App\\Core\\Auth::check', 1, '/var/www/html/src/Core/Auth.php', 14);
              enter('App\\Core\\Session::get', 1, '/var/www/html/src/Core/Session.php', 35, ['user_id']);
              exit(0.2);
            exit(0.5);
            
            // Fetch database records
            enter('App\\Model\\User::findById', 1, '/var/www/html/src/Model/User.php', 55, ['42']);
              enter('App\\Core\\Database::getConnection', 1, '/var/www/html/src/Core/Database.php', 24);
                // First connection makes PDO object
                enter('PDO::__construct', 0, '/var/www/html/src/Core/Database.php', 32, ['mysql:host=localhost;dbname=prod']);
                exit(2.5);
              exit(0.4);
              
              enter('App\\Core\\Database::query', 1, '/var/www/html/src/Core/Database.php', 60, ['SELECT * FROM users WHERE id = :id LIMIT 1']);
                enter('PDO::prepare', 0, '/var/www/html/src/Core/Database.php', 63);
                exit(0.6);
                enter('PDOStatement::execute', 0, '/var/www/html/src/Core/Database.php', 68, [':id => 42']);
                  // Database latency
                  enter('PDOStatement::fetch', 0, '/var/www/html/src/Core/Database.php', 70);
                  exit(3.0); // 3ms database wait
                exit(0.8);
              exit(1.0);
            exit(1.5);
            
            // Fetch User Settings
            enter('App\\Model\\Settings::getForUser', 1, '/var/www/html/src/Model/Settings.php', 110, ['42']);
              enter('App\\Core\\Database::query', 1, '/var/www/html/src/Core/Database.php', 60, ['SELECT * FROM settings WHERE user_id = :uid']);
                enter('PDO::prepare', 0, '/var/www/html/src/Core/Database.php', 63);
                exit(0.4);
                enter('PDOStatement::execute', 0, '/var/www/html/src/Core/Database.php', 68, [':uid => 42']);
                  enter('PDOStatement::fetchAll', 0, '/var/www/html/src/Core/Database.php', 70);
                  exit(1.8);
                exit(0.6);
              exit(0.8);
            exit(1.2);
            
            // Fetch user activities - loop rendering
            enter('App\\Model\\Activity::getRecent', 1, '/var/www/html/src/Model/Activity.php', 40, ['42', '10']);
              enter('App\\Core\\Database::query', 1, '/var/www/html/src/Core/Database.php', 60, ['SELECT * FROM activities WHERE user_id = :uid ORDER BY created_at DESC LIMIT 10']);
                enter('PDO::prepare', 0, '/var/www/html/src/Core/Database.php', 63);
                exit(0.4);
                enter('PDOStatement::execute', 0, '/var/www/html/src/Core/Database.php', 68, [':uid => 42']);
                  enter('PDOStatement::fetchAll', 0, '/var/www/html/src/Core/Database.php', 70);
                  exit(2.5);
                exit(0.7);
              exit(0.9);
            exit(1.4);

            // View Template Rendering
            enter('App\\Core\\View::display', 1, '/var/www/html/src/Core/View.php', 45, ['profile.twig', 'array(...)']);
              enter('Twig\\Environment::render', 1, '/var/www/html/vendor/twig/twig/src/Environment.php', 90);
                enter('Twig\\Environment::load', 1, '/var/www/html/vendor/twig/twig/src/Environment.php', 145);
                  enter('Twig\\Loader\\FilesystemLoader::findTemplate', 1, '/var/www/html/vendor/twig/twig/src/Loader/FilesystemLoader.php', 190);
                  exit(0.3);
                exit(0.8);
                
                enter('Twig\\Template::display', 1, '/var/www/html/vendor/twig/twig/src/Template.php', 45);
                  
                  // Layout wrapper
                  enter('__TwigTemplate_base_layout::display', 1, '/var/www/html/storage/twig/cache/base_layout.php', 20);
                    
                    // Render stylesheet tags
                    enter('__TwigTemplate_base_layout::block_stylesheets', 1, '/var/www/html/storage/twig/cache/base_layout.php', 65);
                      enter('App\\Helper\\Asset::getUrl', 1, '/var/www/html/src/Helper/Asset.php', 18, ['css/main.css']);
                      exit(0.3);
                    exit(0.5);
                    
                    // Profile content block
                    enter('__TwigTemplate_profile::block_content', 1, '/var/www/html/storage/twig/cache/profile.php', 50);
                      
                      // User header
                      enter('App\\Helper\\UserHelper::formatName', 1, '/var/www/html/src/Helper/UserHelper.php', 10);
                        enter('App\\Helper\\Sanitizer::escape', 1, '/var/www/html/src/Helper/Sanitizer.php', 30, ['John Doe']);
                          enter('htmlspecialchars', 0, '/var/www/html/src/Helper/Sanitizer.php', 32);
                          exit(0.1);
                        exit(0.4);
                      exit(0.7);

                      // Loop over 5 activities
                      for (let i = 0; i < 5; i++) {
                        enter('__TwigTemplate_profile::render_activity_row', 1, '/var/www/html/storage/twig/cache/profile.php', 110, [`row_${i}`]);
                          
                          enter('App\\Helper\\DateHelper::timeAgo', 1, '/var/www/html/src/Helper/DateHelper.php', 22);
                            enter('DateTime::__construct', 0, '/var/www/html/src/Helper/DateHelper.php', 25, ['2026-05-30 11:30:00']);
                            exit(0.4);
                            enter('DateTime::diff', 0, '/var/www/html/src/Helper/DateHelper.php', 28);
                            exit(0.3);
                          exit(0.8);

                          enter('App\\Helper\\Sanitizer::escape', 1, '/var/www/html/src/Helper/Sanitizer.php', 30);
                            enter('htmlspecialchars', 0, '/var/www/html/src/Helper/Sanitizer.php', 32);
                            exit(0.15);
                          exit(0.4);
                          
                        exit(1.0);
                      }
                      
                      // Render JSON payload for frontend script config
                      enter('App\\Helper\\JsonHelper::encode', 1, '/var/www/html/src/Helper/JsonHelper.php', 40);
                        enter('json_encode', 0, '/var/www/html/src/Helper/JsonHelper.php', 42);
                        exit(0.3);
                      exit(0.5);

                    exit(2.0); // Exit content block
                    
                    // Render footer block
                    enter('__TwigTemplate_base_layout::block_footer', 1, '/var/www/html/storage/twig/cache/base_layout.php', 120);
                      enter('date', 0, '/var/www/html/storage/twig/cache/base_layout.php', 122, ['Y']);
                      exit(0.2);
                    exit(0.4);

                  exit(1.8);
                exit(2.0);
              exit(2.5);
            exit(3.0);
            
          exit(3.5); // UserController::show
        exit(0.8); // Router::callController
      exit(1.2); // Router::dispatch
    exit(1.0); // Application::run
  exit(0.5); // main
  
  lines.push(`TRACE END [${time.toFixed(6)}]`);
  
  return lines.join('\n');
}
