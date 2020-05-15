const { exec } = require('child_process');

console.log('CREATING BOOTSTRAP DUMP')
exec('rm -rf idanodejs && mongodump --db idanodejs --out ./', function (error, stdout, stderr) {
  if (error) {
    console.log(error.stack);
    console.log('Error code: '+error.code);
    console.log('Signal received: '+error.signal);
  }
  console.log('CREATING TAR.GZ FILE')
  exec('tar -czvf idanode_bootstrap.gz ./idanodejs', function (error, stdout, stderr) {
    if (error) {
      console.log(error.stack);
      console.log('Error code: '+error.code);
      console.log('Signal received: '+error.signal);
    }
    console.log('FILE CREATED CORRECTLY, REMOVING DUMP FOLDER')
    exec('rm -rf idanodejs', function (error, stdout, stderr) {
        if (error) {
            console.log(error.stack);
            console.log('Error code: '+error.code);
            console.log('Signal received: '+error.signal);
        }
        console.log('BOOTSTRAP COMPLETED')
    })
  })
})